import { Monitor, Moon, Sun } from "lucide-react";
import { useAppearancePreferences } from "../hooks/useAppearancePreferences";

export function AppearanceControls({ typography = false }: { typography?: boolean }) {
  const { preferences, updateAppearance } = useAppearancePreferences();
  const themeOptions = [
    ["system", "跟随系统", "使用设备当前的外观", Monitor],
    ["light", "浅色", "始终使用浅色界面", Sun],
    ["dark", "深色", "始终使用深色界面", Moon],
  ] as const;

  return <div className={`appearance-controls${typography ? " appearance-controls--compact" : ""}`}>
    {typography ? <div className="appearance-row"><span>主题</span><span className="appearance-segment" role="group" aria-label="主题">
      {themeOptions.map(([value, label]) =>
        <button key={value} type="button" aria-pressed={preferences.theme === value} onClick={() => updateAppearance({ theme: value })}>{label}</button>)}
    </span></div> : <section className="appearance-theme-card" aria-labelledby="appearance-theme-title">
      <div className="appearance-theme-heading">
        <div>
          <h2 id="appearance-theme-title">主题</h2>
        </div>
      </div>
      <div className="appearance-theme-options" role="group" aria-label="主题">
        {themeOptions.map(([value, label, description, Icon]) =>
          <button key={value} type="button" className="appearance-theme-option" aria-pressed={preferences.theme === value} onClick={() => updateAppearance({ theme: value })}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <small>{description}</small>
          </button>)}
      </div>
    </section>}
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
