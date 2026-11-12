import { useState } from "react";
import {
  SETTING_FIELDS, SETTING_GROUPS, type SettingKey, type SettingValues, defaultSettingValues, settingProblem,
} from "../domain/settings";

/**
 * The planning settings dialog. It is rendered from SETTING_FIELDS
 * (domain/settings.ts), so adding a setting there needs no change here.
 * Each value is kept as typed text until Save, so a half-typed number is shown
 * as a problem rather than silently rounded.
 */

interface Props {
  values: SettingValues;
  onSave: (values: SettingValues) => void;
  onCancel: () => void;
}

const asText = (v: SettingValues): Record<SettingKey, string> =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [k, String(n)])) as Record<SettingKey, string>;

export default function SettingsForm({ values, onSave, onCancel }: Props) {
  const [text, setText] = useState(() => asText(values));
  const parsed = Object.fromEntries(
    SETTING_FIELDS.map((f) => [f.key, text[f.key].trim() === "" ? Number.NaN : Number(text[f.key])]),
  ) as SettingValues;
  const problems = Object.fromEntries(
    SETTING_FIELDS.map((f) => [f.key, settingProblem(f, parsed[f.key])]),
  ) as Record<SettingKey, string | null>;
  const invalid = Object.values(problems).some(Boolean);

  return (
    <div className="modal" role="dialog" aria-label="Settings">
      <div className="sheet" style={{ width: "min(760px, 100%)" }}>
        <div className="sheet-head">
          <h2>Settings</h2>
          <button className="dim" onClick={onCancel}>close ✕</button>
        </div>
        <p className="small dim" style={{ margin: "4px 0 0" }}>
          Stored in the register, so they travel with it. Saving is recorded in History and can be
          reverted. Releases are edited on Schedule, projects on Projects.
        </p>

        {SETTING_GROUPS.map((g) => (
          <fieldset key={g} className="settings-group">
            <legend>{g}</legend>
            {SETTING_FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.key} className="setting">
                <label htmlFor={`setting-${f.key}`}>{f.label}</label>
                <div className="setting-input">
                  <input id={`setting-${f.key}`} type="number" inputMode="decimal"
                         min={f.rule === "count" ? 1 : 0} step={f.rule === "count" ? 1 : "any"}
                         value={text[f.key]} aria-invalid={problems[f.key] ? true : undefined}
                         aria-describedby={`setting-${f.key}-why`}
                         onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))} />
                  <span className="dim small">{f.unit}</span>
                </div>
                <div id={`setting-${f.key}-why`} className="small dim">
                  {problems[f.key] ? <span className="tag Decline">{problems[f.key]}</span> : f.drives}
                </div>
              </div>
            ))}
          </fieldset>
        ))}

        <div className="sheet-foot">
          <button onClick={() => setText(asText(defaultSettingValues()))}
                  title="Fill the form with the defaults. Nothing changes until you save.">
            Restore defaults
          </button>
          <div className="spacer" />
          <button onClick={onCancel}>Cancel</button>
          <button className="pick" disabled={invalid} onClick={() => onSave(parsed)}>Save settings</button>
        </div>
      </div>
    </div>
  );
}
