export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type SummarySource = "article" | "transcript";
export type SummaryProgressCallback = (progress: number) => void;
export type CreateAiCompletion = (
  messages: AiChatMessage[],
  timeoutMs?: number,
) => Promise<string>;

const PODCAST_DIRECT_SUMMARY_CHARS = 24_000;
const PODCAST_CHUNK_CHARS = 18_000;
const TRANSCRIPTION_PROMPT_ARTIFACTS = [
  "请用简体的文字点符号",
  "请用简体中文标点符号",
  "请使用简体中文标点符号",
];

export class AiSummaryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiSummaryInputError";
  }
}

export function splitTranscriptForSummary(text: string, maxChars = PODCAST_CHUNK_CHARS): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const line of normalized.split("\n")) {
    if (line.length > maxChars) {
      pushCurrent();
      for (let offset = 0; offset < line.length; offset += maxChars) {
        chunks.push(line.slice(offset, offset + maxChars));
      }
      continue;
    }
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars) pushCurrent();
    current = current ? `${current}\n${line}` : line;
  }
  pushCurrent();
  return chunks;
}

export function cleanPodcastTranscriptForSummary(text: string): string {
  const cleanedLines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => {
    const spokenText = line.replace(/^\s*\[[^\]]+\]\s*/, "").trim();
    const compact = spokenText.replace(/[\s，。！？、,.!?；;：:“”‘’（）()\-—…]/g, "");
    if (!compact) return false;
    if (/^(?:嗯|啊|呃|额|哦|唔|哎|诶){4,}$/u.test(compact)) return false;
    return !TRANSCRIPTION_PROMPT_ARTIFACTS.some((artifact) => {
      const remainder = compact.split(artifact).join("");
      return remainder.length === 0;
    });
  });

  return cleanedLines.join("\n").trim();
}

async function summarizePodcastTranscript(
  createCompletion: CreateAiCompletion,
  title: string,
  transcript: string,
  showNotes: string,
  onProgress?: SummaryProgressCallback,
): Promise<string> {
  const cleanTranscript = cleanPodcastTranscriptForSummary(transcript) || transcript.trim();
  if (!cleanTranscript) {
    throw new AiSummaryInputError("Podcast transcript is empty.");
  }

  let evidence = cleanTranscript;
  let evidenceLabel = "完整逐字稿";
  onProgress?.(8);
  if (cleanTranscript.length > PODCAST_DIRECT_SUMMARY_CHARS) {
    const chunks = splitTranscriptForSummary(cleanTranscript);
    const notes: string[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const note = await createCompletion([
        {
          role: "system",
          content: "你是严谨的播客研究助理。只提取给定片段中的事实、论点和时间线索，不补充外部信息。",
        },
        {
          role: "user",
          content: `这是播客《${title || "未命名节目"}》逐字稿的第 ${index + 1}/${chunks.length} 段。

请输出不超过 900 字的证据笔记，包含：
- 本段讨论主题与论证推进
- 关键判断及其理由
- 重要人物、数字、案例和分歧
- 值得保留的时间戳（如果原文提供）

不要写整期总结，不要重复口头语，不要添加片段之外的信息。

逐字稿片段：
${chunks[index]}`,
        },
      ], 90_000);
      notes.push(`### 分段 ${index + 1}/${chunks.length}\n${note.slice(0, 5_000)}`);
      onProgress?.(10 + Math.round(((index + 1) / chunks.length) * 70));
    }
    evidence = notes.join("\n\n");
    evidenceLabel = "覆盖完整逐字稿的分段证据笔记";
  }

  const cleanShowNotes = showNotes.trim().slice(0, 16_000) || "（无可用节目简介）";
  onProgress?.(85);
  const summary = await createCompletion([
    {
      role: "system",
      content:
        "你是专业、克制的中文播客编辑。摘要必须完全建立在提供的逐字稿证据上，" +
        "不得编造，不得把节目简介中的宣传性表述当成已证实事实。返回结构清晰的 Markdown。",
    },
    {
      role: "user",
      content: `请为播客《${title || "未命名节目"}》制作接近专业播客编辑成品的中文摘要。

必须严格使用以下结构：

## 核心摘要
先用 2-3 句话概括节目讨论对象、核心结论和主要价值，然后给出 4-6 条关键观点。每条格式为：
- **短标题**：判断 + 支撑理由。保留关键人名、数字、案例和观点分歧。

## 深度精华
按节目实际推进顺序写 4-8 个小节，每节使用“### 序号. 小节标题”。每节 1-2 段，说明观点如何展开、依据是什么、与前后内容有什么关系。逐字稿提供时间戳时，在小节标题后保留最相关的时间点。

### 值得回听
列出 3-5 个高信息密度片段，格式为“- **时间点**：回听理由”。没有可靠时间戳时省略时间点，不得猜测。

要求：
- 覆盖整期节目，不能只总结开头
- 删除寒暄、口头语和无信息量重复
- 区分事实、主播判断和推测；保留重要分歧与适用边界
- 不复述节目简介，不输出预计阅读时间
- 只输出上述 Markdown 正文

节目简介（仅用于校正名称和理解结构）：
${cleanShowNotes}

${evidenceLabel}：
${evidence}`,
    },
  ], 90_000);
  onProgress?.(100);
  return summary;
}

export async function summarizeWithCompletion(
  createCompletion: CreateAiCompletion,
  title: string,
  content?: string,
  snippet?: string,
  source: SummarySource = "article",
  onProgress?: SummaryProgressCallback,
): Promise<string> {
  if (source === "transcript") {
    return summarizePodcastTranscript(createCompletion, title, content || "", snippet || "", onProgress);
  }

  const articleText = (content || snippet || "").slice(0, 12_000);
  onProgress?.(15);
  const summary = await createCompletion([
    {
      role: "system",
      content:
        "You summarize RSS articles accurately. Do not add facts that are not in the source. " +
        "Use the article's primary language. Return clean Markdown.",
    },
    {
      role: "user",
      content: `请根据以下文章输出：
1. 2-3 句话的核心摘要
2. 3 条关键要点
3. 预计阅读时间

要求：
- 不添加原文中没有的信息
- 保留重要数字、人名和结论
- 使用原文主要语言回答

标题：${title || "Untitled"}
正文：${articleText}`,
    },
  ]);
  onProgress?.(100);
  return summary;
}
