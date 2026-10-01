import { useAppearancePreferences } from "../hooks/useAppearancePreferences";

export function AppearanceControls({ typography = false }: { typography?: boolean }) {
  const { preferences, updateAppearance } = useAppearancePreferences();
  return <div className="appearance-controls">
    <div className="appearance-row"><span>主题</span><span className="appearance-segment" role="group" aria-label="主题">
      {([["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={preferences.theme === value} onClick={() => updateAppearance({ theme: value })}>{label}</button>)}
    </span></div>
    {typography && <>
      <div className="appearance-row"><span>字体</span><span className="appearance-segment" role="group" aria-label="正文字体">
        {([["sans", "系统黑体"], ["serif", "思源宋体"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={preferences.font === value} onClick={() => updateAppearance({ font: value })}>{label}</button>)}
      </span></div>
      <div className="appearance-row"><span>对齐</span><span className="appearance-segment" role="group" aria-label="正文对齐">
        {([["left", "左对齐"], ["justify", "两端对齐"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={preferences.alignment === value} onClick={() => updateAppearance({ alignment: value })}>{label}</button>)}
      </span></div>
    </>}
  </div>;
}
