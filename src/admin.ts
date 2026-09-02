const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0B1628">
  <title>Gorelo Router · Cloudflare Email Automation</title>
  <link rel="stylesheet" href="/admin/tabler.css">
  <style nonce="__CSP_NONCE__">
    :root {
      color-scheme: light;
      --navy-950:#07101e; --navy-900:#0b1628; --navy-800:#13233c;
      --ink:#14213a; --muted:#526178; --soft:#66758a; --line:#d8e0eb;
      --control:#8696ab; --brand-source:#2563eb; --brand:#2563eb; --brand-dark:#1f50bd; --brand-contrast:#fff; --brand-text:#2563eb;
      --brand-rgb:37,99,235; --brand-tint:#e9effd; --brand-tint-text:#1b47a9;
      --focus-canvas:#2563eb; --focus-navigation:#22d3ee;
      --accent:#22d3ee; --accent-on-navigation:#22d3ee;
      --navigation:#0b1628; --navigation-deep:#091222; --navigation-soft:#0e203e;
      --navigation-contrast:#fff; --navigation-muted:#c3c7ce; --navigation-surface:#1f2a3b;
      --navigation-hover:#2d3748; --navigation-border:#46505f;
      --success:#087a55; --success-bg:#e9f9f2; --warning:#a15c07; --warning-bg:#fff7df;
      --danger:#b42318; --danger-bg:#fff0ee; --slate-bg:#eef2f7; --surface:#fff;
      --canvas:#f4f7fb; --shadow:0 18px 45px rgba(20,33,58,.08),0 2px 8px rgba(20,33,58,.04);
      --ease-out:cubic-bezier(.16,1,.3,1);
      --tblr-primary:var(--brand); --tblr-primary-rgb:var(--brand-rgb); --tblr-link-color:var(--brand-text);
    }
    * { box-sizing:border-box; }
    * { scrollbar-color:#9aa9bc transparent; scrollbar-width:thin; }
    *::-webkit-scrollbar { width:10px; height:10px; }
    *::-webkit-scrollbar-thumb { border:3px solid transparent; border-radius:999px; background:#9aa9bc; background-clip:padding-box; }
    *::-webkit-scrollbar-thumb:hover { background:#718198; background-clip:padding-box; }
    ::selection { color:var(--navigation-contrast); background:var(--brand); }
    html { min-height:100%; background:var(--canvas); }
    body { min-height:100vh; margin:0; font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--canvas); }
    button,input,select,textarea { font:inherit; }
    input,select,textarea { caret-color:var(--brand); }
    button,input,select,textarea,summary { -webkit-tap-highlight-color:transparent; }
    button { min-height:42px; padding:9px 14px; border:1px solid var(--control); border-radius:10px; color:var(--ink); background:#fff; font-weight:650; cursor:pointer; transition:border-color .16s var(--ease-out),background .16s var(--ease-out),color .16s var(--ease-out),box-shadow .16s var(--ease-out),transform .16s var(--ease-out); }
    button:hover:not(:disabled) { border-color:#64748b; background:#f8fafc; }
    button:active:not(:disabled) { transform:translateY(1px); }
    button:disabled { opacity:.58; cursor:not-allowed; }
    button.primary { color:var(--brand-contrast); border-color:var(--brand); background:var(--brand); box-shadow:0 6px 16px rgba(var(--brand-rgb),.2); }
    button.primary:hover:not(:disabled) { border-color:var(--brand-dark); background:var(--brand-dark); }
    button.ghost { color:var(--muted); border-color:transparent; background:transparent; box-shadow:none; }
    button.ghost:hover:not(:disabled) { color:var(--ink); background:#edf2f8; }
    button.danger { color:var(--danger); border-color:#efb4ae; background:#fff; }
    button.danger:hover:not(:disabled) { background:var(--danger-bg); }
    button.small { min-height:36px; padding:7px 11px; border-radius:9px; font-size:13px; }
    button[aria-busy="true"] { position:relative; }
    button[aria-busy="true"]::before { width:14px; height:14px; display:inline-block; margin-right:7px; vertical-align:-2px; content:""; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:busy-spin .7s linear infinite; }
    @keyframes busy-spin { to { transform:rotate(1turn); } }
    :focus-visible { outline:3px solid var(--focus-canvas); outline-offset:2px; box-shadow:0 0 0 5px var(--focus-navigation); }
    input,select,textarea { width:100%; min-height:42px; padding:9px 11px; border:1px solid var(--control); border-radius:10px; color:var(--ink); background:#fff; transition:border-color .16s,box-shadow .16s; }
    input:hover,select:hover,textarea:hover { border-color:#64748b; }
    input:focus,select:focus,textarea:focus { border-color:var(--focus-canvas); outline:2px solid var(--focus-canvas); outline-offset:1px; box-shadow:0 0 0 4px var(--focus-navigation); }
    input[type="checkbox"] { width:18px; min-height:18px; accent-color:var(--brand); }
    input[type="number"] { font-variant-numeric:tabular-nums; }
    textarea { min-height:112px; resize:vertical; }
    textarea.code { min-height:440px; font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; tab-size:2; }
    #testHeaders { min-height:140px; }
    code,pre { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
    pre { max-width:100%; margin:0; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; }
    h1,h2,h3,p { margin-top:0; }
    h1 { margin-bottom:0; font-size:20px; line-height:1.15; letter-spacing:-.02em; }
    h2 { margin-bottom:5px; font-size:22px; line-height:1.25; letter-spacing:-.025em; }
    h3 { margin-bottom:4px; font-size:15px; line-height:1.3; }
    .hidden,[hidden] { display:none !important; }
    .visually-hidden { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
    .muted { color:var(--muted); }
    .subtle { color:var(--soft); }
    .icon { width:18px; height:18px; display:block; flex:0 0 auto; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .shell { width:min(1180px,calc(100% - 40px)); margin-inline:auto; }
    .skip-link { position:fixed; z-index:1000; top:10px; left:10px; padding:9px 13px; border-radius:9px; color:var(--brand-contrast); background:var(--brand); transform:translateY(-150%); transition:transform .18s var(--ease-out); }
    .skip-link:focus { transform:translateY(0); }

    .app-header { position:relative; overflow:hidden; color:var(--navigation-contrast); background:var(--navigation); box-shadow:0 1px 0 var(--navigation-border) inset; }
    .app-header::before { position:absolute; inset:0; content:""; opacity:.32; background:radial-gradient(circle at 82% -90%,rgba(34,211,238,.42),transparent 46%); pointer-events:none; }
    .header-inner { position:relative; z-index:1; min-height:86px; display:flex; align-items:center; justify-content:space-between; gap:24px; }
    .brand { min-width:0; flex:1 1 auto; display:flex; align-items:center; gap:12px; }
    .brand > div:last-child { min-width:0; }
    .brand-mark { width:42px; height:42px; display:grid; place-items:center; overflow:hidden; border-radius:13px; color:var(--brand-contrast); background:var(--brand); box-shadow:0 10px 24px rgba(0,0,0,.25); }
    .brand-mark .icon { width:23px; height:23px; stroke-width:1.9; }
    .brand-subtitle { margin:3px 0 0; color:var(--navigation-muted); font-size:12px; }
    .brand h1,.brand-subtitle { max-width:min(62vw,620px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .session-controls { flex:0 0 auto; display:flex; align-items:center; gap:12px; }
    .connection-pill { display:flex; align-items:center; gap:8px; padding:7px 11px; border:1px solid var(--navigation-border); border-radius:999px; color:var(--navigation-contrast); background:var(--navigation-surface); font-size:12px; font-weight:700; }
    .status-dot { width:8px; height:8px; border-radius:50%; background:#34d399; box-shadow:0 0 0 4px rgba(52,211,153,.14); }
    .status-dot.syncing { background:var(--accent-on-navigation); animation:status-breathe 1.1s var(--ease-out) infinite alternate; }
    @keyframes status-breathe { to { box-shadow:0 0 0 7px rgba(34,211,238,.08); transform:scale(.86); } }
    .header-button { color:var(--navigation-contrast); border-color:var(--navigation-border); background:var(--navigation-surface); }
    .header-button:hover:not(:disabled) { color:var(--navigation-contrast); border-color:var(--navigation-contrast); background:var(--navigation-hover); }
    .command-trigger { display:flex; align-items:center; gap:8px; }
    .command-trigger .icon { width:16px; height:16px; }
    kbd { min-width:23px; padding:2px 6px; border:1px solid #566275; border-bottom-color:#707b8c; border-radius:6px; color:var(--navigation-muted); background:var(--navigation-deep); box-shadow:0 1px 0 #020712; font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; text-align:center; }

    main.shell { padding-block:28px 56px; }
    .login-layout { min-height:calc(100vh - 170px); display:grid; grid-template-columns:minmax(0,1.1fr) minmax(360px,.72fr); align-items:center; gap:72px; padding-block:34px; }
    .login-hero { padding:24px 4px; }
    .login-hero h2 { max-width:680px; margin-bottom:16px; font-size:clamp(34px,5vw,56px); line-height:1.05; letter-spacing:-.045em; }
    .login-hero > p { max-width:630px; color:var(--muted); font-size:17px; }
    .flow-line { display:flex; align-items:center; gap:9px; margin-top:27px; color:var(--muted); font-size:12px; font-weight:750; letter-spacing:.02em; }
    .flow-node { padding:7px 10px; border:1px solid var(--line); border-radius:9px; color:var(--ink); background:#fff; box-shadow:0 3px 10px rgba(20,33,58,.05); }
    .flow-arrow { color:var(--brand); font-size:16px; }
    .login-card { position:relative; padding:28px; border:1px solid #dce4ef; border-radius:20px; background:rgba(255,255,255,.94); box-shadow:var(--shadow); }
    .login-card::before { position:absolute; inset:0 auto auto 28px; width:54px; height:3px; content:""; border-radius:0 0 3px 3px; background:linear-gradient(90deg,var(--brand),var(--accent)); }
    .login-card h2 { font-size:19px; }
    .form-field { min-width:0; display:grid; align-content:start; gap:6px; }
    .form-grid,.condition-grid,.webhook-action-grid,.extraction-core,.extraction-source-fields,.extraction-options,.client-linkage,.gorelo-action-grid,.test-form-grid,.webhook-form-grid { align-items:start; }
    .form-field > label,.field-label { color:#34445e; font-size:12px; font-weight:750; }
    .field-help { color:var(--muted); font-size:12px; }
    .login-actions { display:grid; gap:10px; margin-top:17px; }
    .login-actions button { width:100%; }
    .security-note { display:flex; gap:9px; margin:17px 0 0; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
    .security-icon { width:22px; height:22px; flex:0 0 auto; display:grid; place-items:center; border-radius:7px; color:var(--success); background:var(--success-bg); font-size:11px; font-weight:900; }
    .error { margin:10px 0 0; color:var(--danger); white-space:pre-wrap; overflow-wrap:anywhere; }

    .workspace-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:16px; }
    .workspace-heading h2 { margin-bottom:4px; font-size:clamp(24px,3vw,30px); }
    .workspace-heading p { max-width:70ch; margin:0; color:var(--muted); }
    .ready-label { display:flex; align-items:center; gap:8px; color:var(--success); font-size:12px; font-weight:750; }
    .stats-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; margin-bottom:18px; overflow:hidden; border:1px solid var(--line); border-radius:15px; background:var(--surface); }
    .stat-card { min-height:94px; display:flex; align-items:center; gap:13px; padding:16px; border:0; border-left:1px solid var(--line); border-radius:0; background:transparent; }
    .stat-card:first-child { border-left:0; }
    .stat-card.warning { background:linear-gradient(90deg,rgba(255,240,238,.7),transparent 82%); }
    .stat-icon { width:38px; height:38px; flex:0 0 auto; display:grid; place-items:center; border-radius:11px; color:#285db9; background:#eaf1ff; font-size:13px; font-weight:850; }
    .stat-icon .icon { width:19px; height:19px; }
    .stat-card.warning .stat-icon { color:var(--danger); background:var(--danger-bg); }
    .stat-value { display:block; margin-bottom:1px; font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:-.03em; }
    .stat-value.metric-changed { animation:metric-set .42s var(--ease-out); }
    @keyframes metric-set { 45% { color:var(--brand-text); transform:translateY(-2px); } }
    .stat-label { color:var(--muted); font-size:12px; font-weight:650; }

    .tabs { --indicator-x:5px; --indicator-scale:0; position:relative; isolation:isolate; display:flex; gap:5px; margin-bottom:14px; padding:5px; overflow-x:auto; border:1px solid var(--line); border-radius:13px; background:#e9eef5; scrollbar-width:none; }
    .tabs::-webkit-scrollbar { display:none; }
    .tabs button { position:relative; z-index:1; min-width:max-content; display:flex; align-items:center; gap:8px; border-color:transparent; color:#526178; background:transparent; box-shadow:none; }
    .tabs button:hover:not(:disabled) { border-color:transparent; color:var(--ink); background:rgba(255,255,255,.52); }
    .tabs button[aria-selected="true"] { color:var(--ink); border-color:transparent; background:transparent; box-shadow:none; }
    .tab-indicator { position:absolute; z-index:0; top:5px; bottom:5px; left:0; width:1px; border-radius:999px; background:#fff; box-shadow:0 2px 7px rgba(20,33,58,.08); pointer-events:none; transform:translateX(var(--indicator-x)) scaleX(var(--indicator-scale)); transform-origin:left center; transition:transform .36s var(--ease-out); }
    .tabs:not([data-indicator-ready="true"]) .tab-indicator { opacity:0; }
    .tab-icon { width:17px; height:17px; }
    .tab-count { min-width:21px; height:21px; display:inline-grid; place-items:center; padding-inline:5px; border-radius:999px; color:#526178; background:#dfe6ef; font-size:10px; font-weight:800; }
    .tabs button[aria-selected="true"] .tab-count { color:var(--brand-tint-text); background:var(--brand-tint); }
    .panel { margin-bottom:16px; padding:21px; border:1px solid var(--line); border-radius:15px; background:var(--surface); }
    .panel-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
    .panel-header p { margin:0; color:var(--muted); }
    .panel-header > div:first-child { max-width:75ch; }
    .toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .toolbar select { width:auto; min-width:185px; }
    .loading-state { display:grid; gap:9px; padding-block:6px; }
    .skeleton { height:78px; border-radius:13px; background:linear-gradient(90deg,#eef2f6 25%,#f8fafc 38%,#eef2f6 63%); background-size:400% 100%; animation:shimmer 1.4s ease infinite; }
    @keyframes shimmer { to { background-position:-100% 0; } }
    .empty-state { display:grid; justify-items:center; padding:45px 22px; border:1px dashed #b9c5d4; border-radius:14px; text-align:center; background:#fafcff; }
    .empty-icon { width:46px; height:46px; display:grid; place-items:center; margin-bottom:12px; border-radius:14px; color:#3d6fca; background:#eaf1ff; font-size:18px; font-weight:850; }
    .empty-icon .icon { width:22px; height:22px; }
    .empty-state h3 { margin-bottom:5px; font-size:16px; }
    .empty-state p { max-width:440px; margin-bottom:15px; color:var(--muted); }

    .rule-list { display:grid; gap:10px; }
    .rule-card { position:relative; display:grid; grid-template-columns:74px minmax(0,1fr) auto; gap:16px; align-items:center; padding:17px 17px 17px 0; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:#fff; transition:border-color .16s,box-shadow .16s,transform .16s; }
    .rule-card::before { position:absolute; inset:0 auto 0 0; width:4px; content:""; background:#3b82f6; }
    .rule-card.action-quarantine::before { background:#f59e0b; }
    .rule-card.action-reject::before { background:#ef4444; }
    .rule-card.action-drop::before { background:#64748b; }
    .rule-card.system-rule { border-color:#cbd5e1; background:#f3f6fa; }
    .rule-card.system-rule::before { background:#64748b; }
    .rule-card.system-rule .badge.system { color:#475569; background:#dbe4ee; }
    .rule-card.system-rule .retention-note { color:#64748b; }
    .rule-card.disabled { opacity:.68; background:#f8fafc; }
    .rule-card:hover { border-color:#b7c4d4; box-shadow:0 8px 24px rgba(20,33,58,.07); transform:translateY(-1px); }
    .priority { display:grid; justify-items:center; padding-left:4px; color:var(--muted); }
    .priority strong { color:var(--ink); font-size:19px; font-variant-numeric:tabular-nums; }
    .priority span { font-size:9px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
    .rule-main { min-width:0; }
    .rule-title-line { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .rule-title-line h3 { margin:0; font-size:15px; }
    .rule-description { margin:5px 0 9px; color:var(--muted); overflow-wrap:anywhere; }
    .chip-row { display:flex; gap:6px; flex-wrap:wrap; }
    .chip { max-width:100%; padding:4px 8px; border:1px solid #dce4ed; border-radius:7px; color:#43536b; background:#f7f9fc; font-size:11px; overflow-wrap:anywhere; }
    .chip.connector { color:#7b8798; border-style:dashed; background:#fff; font-weight:800; }
    .badge { display:inline-flex; align-items:center; gap:5px; padding:4px 8px; border-radius:999px; font-size:10px; font-weight:850; letter-spacing:.035em; text-transform:uppercase; }
    .badge.forward,.badge.forward_webhook,.badge.create_ticket,.badge.create_alert,.badge.forwarded { color:var(--brand-tint-text); background:var(--brand-tint); }
    .badge.quarantine,.badge.quarantined { color:var(--warning); background:var(--warning-bg); }
    .badge.reject,.badge.rejected,.badge.failed { color:var(--danger); background:var(--danger-bg); }
    .badge.drop,.badge.dropped { color:#536174; background:#e9eef4; }
    .badge.enabled,.badge.released { color:var(--success); background:var(--success-bg); }
    .badge.disabled,.badge.dismissed,.badge.expired { color:#667085; background:#eef1f5; }
    .badge.pending { color:var(--warning); background:var(--warning-bg); }
    .badge.releasing { color:var(--brand-tint-text); background:var(--brand-tint); }
    .badge.release_failed { color:var(--danger); background:var(--danger-bg); }
    .badge.succeeded { color:var(--success); background:var(--success-bg); }
    .badge.delivering { color:var(--brand-tint-text); background:var(--brand-tint); }
    .badge.uncertain { color:var(--warning); background:var(--warning-bg); }
    .rule-actions { display:flex; align-items:center; gap:7px; }
    .switch-button { min-width:46px; position:relative; padding:0; border-color:#a8b4c3; border-radius:999px; background:#cbd4df; }
    .switch-button::after { position:absolute; top:5px; left:5px; width:24px; height:24px; content:""; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.22); transition:transform .18s; }
    .switch-button[aria-checked="true"] { border-color:#15966a; background:#20a877; }
    .switch-button[aria-checked="true"]::after { transform:translateX(10px); }

    .editor-panel { border-color:#b9c9df; box-shadow:var(--shadow); }
    .editor-topline { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:16px; }
    .editor-controls { display:flex; align-items:end; gap:8px; flex-wrap:wrap; }
    .editor-controls .form-field { min-width:220px; }
    .mode-switch { width:max-content; display:flex; gap:4px; margin-bottom:20px; padding:4px; border:1px solid var(--line); border-radius:11px; background:#edf2f7; }
    .mode-switch button { min-height:35px; padding:6px 11px; border-color:transparent; color:var(--muted); background:transparent; box-shadow:none; font-size:12px; }
    .mode-switch button[aria-pressed="true"] { color:var(--ink); border-color:#d2dbe7; background:#fff; box-shadow:0 2px 6px rgba(20,33,58,.08); }
    .form-section { padding:19px 0; border-top:1px solid var(--line); }
    .form-section:first-child { padding-top:0; border-top:0; }
    .section-heading { display:grid; grid-template-columns:30px 1fr; gap:9px; margin-bottom:14px; }
    .section-number { width:27px; height:27px; display:grid; place-items:center; border-radius:9px; color:#285db9; background:#eaf1ff; font-size:11px; font-weight:850; }
    .section-heading h3 { margin:1px 0 1px; }
    .section-heading p { margin:0; color:var(--muted); font-size:12px; }
    .form-grid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:13px; }
    .span-2 { grid-column:span 2; }
    .check-field { display:flex; align-items:center; gap:9px; min-height:42px; padding-top:21px; }
    .check-field label { color:#34445e; font-size:12px; font-weight:700; }
    .conditions { display:grid; gap:9px; }
    .condition-row { display:grid; grid-template-columns:34px minmax(0,1fr) 36px; gap:10px; padding:13px; border:1px solid var(--line); border-radius:13px; background:#fafcff; }
    .condition-index { width:28px; height:28px; display:grid; place-items:center; margin-top:22px; border-radius:8px; color:#526178; background:#e8edf4; font-size:11px; font-weight:850; }
    .condition-grid { display:grid; grid-template-columns:1.1fr 1fr 1.5fr; gap:10px; }
    .condition-meta { display:flex; align-items:center; gap:16px; min-height:28px; margin-top:8px; flex-wrap:wrap; }
    .inline-check { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; font-weight:650; }
    .inline-check input { width:16px; min-height:16px; }
    .condition-meta .inline-check input[data-role="header-name"] { width:min(100%,320px); min-width:220px; min-height:36px; padding:7px 9px; color:var(--ink); border:1px solid var(--control); border-radius:9px; background:#fff; font-size:13px; font-weight:500; }
    .mime-hint { padding:3px 7px; border-radius:6px; color:#86520b; background:#fff4d4; font-size:10px; font-weight:750; }
    .remove-condition { width:36px; min-height:36px; align-self:start; margin-top:18px; padding:0; color:#7b8798; border-color:transparent; background:transparent; font-size:19px; }
    .remove-condition:hover:not(:disabled) { color:var(--danger); background:var(--danger-bg); }
    .add-condition { margin-top:10px; }
    .webhook-action-config,.mapped-action-config,.gorelo-action-config { display:grid; gap:13px; margin-top:14px; padding:14px; border:1px solid #c6d4e5; border-radius:13px; background:#f8fbff; }
    .webhook-action-grid { display:grid; grid-template-columns:minmax(220px,1.1fr) minmax(180px,.9fr); gap:10px; }
    .webhook-destination-line { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; align-items:end; }
    .webhook-destination-line button { white-space:nowrap; }
    .webhook-action-status { grid-column:1/-1; margin:-3px 0 0; color:var(--muted); font-size:11px; }
    .extraction-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding-top:2px; }
    .extraction-heading h4 { margin:0; font-size:13px; }
    .extraction-heading p { margin:2px 0 0; color:var(--muted); font-size:11px; }
    .extraction-actions { display:flex; align-items:center; gap:7px; flex-wrap:wrap; justify-content:flex-end; }
    .teach-parser { color:#fff; border-color:var(--brand); background:var(--brand); }
    .teach-parser:hover:not(:disabled) { color:#fff; border-color:var(--brand-dark); background:var(--brand-dark); }
    .extraction-fields { display:grid; gap:8px; }
    .extraction-row { display:grid; grid-template-columns:30px minmax(0,1fr) 36px; gap:9px; padding:11px; border:1px solid var(--line); border-radius:11px; background:#fff; }
    .extraction-index { width:28px; height:28px; display:grid; place-items:center; margin-top:21px; border-radius:8px; color:#526178; background:#e8edf4; font-size:11px; font-weight:850; }
    .extraction-content { min-width:0; display:grid; gap:9px; }
    .extraction-core,.extraction-source-fields { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
    .extraction-source-fields:empty { display:none; }
    .extraction-advanced { padding-top:7px; border-top:1px solid var(--line); }
    .extraction-advanced summary { width:max-content; color:var(--brand-text); cursor:pointer; font-size:11px; font-weight:750; }
    .extraction-options { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 132px 132px; gap:9px; margin-top:10px; }
    .extraction-start { grid-column:1/3; }
    .extraction-end { grid-column:3/5; }
    .extraction-default { grid-column:1/3; }
    .extraction-marker { min-height:64px; resize:vertical; font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; }
    .extraction-checks { grid-column:1/-1; display:flex; gap:16px; flex-wrap:wrap; }
    .remove-extraction { width:36px; min-height:36px; align-self:start; margin-top:18px; padding:0; color:#7b8798; border-color:transparent; background:transparent; font-size:19px; }
    .remove-extraction:hover:not(:disabled) { color:var(--danger); background:var(--danger-bg); }
    .client-linkage { display:grid; grid-template-columns:minmax(220px,1fr) minmax(180px,.7fr); gap:10px; padding-top:12px; border-top:1px solid var(--line); }
    .gorelo-action-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .gorelo-action-heading h4 { margin:0; font-size:13px; }
    .gorelo-action-heading p { margin:2px 0 0; color:var(--muted); font-size:11px; }
    .gorelo-action-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
    .gorelo-action-grid .wide { grid-column:1/-1; }
    .gorelo-action-grid textarea { min-height:88px; }
    .gorelo-action-grid select[multiple] { min-height:112px; padding:5px; }
    .gorelo-action-grid select[multiple] option { padding:5px 7px; border-radius:5px; }
    .gorelo-assignment-section { display:grid; gap:11px; padding:14px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
    .gorelo-assignment-heading h5 { margin:0; font-size:13px; }
    .gorelo-assignment-heading p { margin:3px 0 0; color:var(--muted); font-size:11px; }
    .gorelo-assignment-grid { display:grid; }
    .gorelo-assignment-row { min-width:0; display:grid; grid-template-columns:minmax(150px,.6fr) minmax(170px,.7fr) minmax(0,1.45fr); gap:12px; align-items:start; padding:13px 0; border-top:1px solid var(--line); }
    .gorelo-assignment-row:first-child { padding-top:2px; border-top:0; }
    .gorelo-assignment-copy h6 { margin:0; color:#34445e; font-size:12px; }
    .gorelo-assignment-copy .field-help { display:block; margin-top:3px; }
    .gorelo-assignment-dynamic { display:grid; grid-template-columns:minmax(0,1fr) minmax(120px,.7fr); gap:9px; }
    .gorelo-assignment-dynamic > .field-help { grid-column:1/-1; }
    .gorelo-assignment-fixed select[multiple] { min-height:112px; padding:5px; }
    .gorelo-catalog-status { margin:0; padding:9px 10px; border-radius:9px; color:var(--muted); background:#eef4fc; font-size:11px; }
    .gorelo-catalog-status.warning { color:var(--warning); background:var(--warning-bg); }
    .gorelo-variable-bar { display:grid; grid-template-columns:180px minmax(0,1fr); gap:10px 14px; align-items:start; padding:11px 12px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); background:#fff; }
    .gorelo-variable-copy strong,.gorelo-variable-copy span { display:block; }
    .gorelo-variable-copy strong { font-size:12px; }
    .gorelo-variable-copy span { margin-top:2px; color:var(--muted); font-size:10px; }
    .gorelo-variable-chips { max-height:82px; display:flex; gap:6px; flex-wrap:wrap; overflow:auto; }
    .variable-token { min-height:30px; padding:4px 8px; border-color:#c7d5e9; border-radius:7px; color:var(--brand-tint-text); background:var(--brand-tint); font:700 11px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; }
    .variable-token:hover:not(:disabled) { border-color:#9db9e7; color:#153f91; background:#dce8fb; }
    .gorelo-flags { grid-column:1/-1; display:flex; gap:18px; flex-wrap:wrap; padding-top:3px; }
    .gorelo-template-help { margin:0; color:var(--muted); font-size:11px; }
    .action-note { margin:11px 0 0; padding:10px 12px; border:1px solid #b8cff3; border-radius:9px; color:var(--muted); background:#f4f8ff; font-size:12px; }
    .action-note.warning { color:var(--warning); border-color:#e8c57d; background:#fffaf0; }
    .editor-footer { position:sticky; z-index:3; bottom:0; display:flex; align-items:center; justify-content:space-between; gap:14px; margin:18px -21px -21px; padding:13px 21px; border-top:1px solid var(--line); border-radius:0 0 17px 17px; background:rgba(255,255,255,.96); backdrop-filter:blur(8px); }
    .editor-footer p { margin:0; color:var(--muted); font-size:12px; }
    .editor-actions { display:flex; gap:8px; }

    .filter-bar { display:grid; grid-template-columns:minmax(220px,1fr) 180px auto; gap:12px; align-items:end; margin-bottom:13px; }
    .filter-bar > button { min-height:42px; height:auto; align-self:end; white-space:nowrap; }
    .event-list { display:grid; gap:8px; }
    .pagination-control { width:100%; margin-top:10px; }
    .event-card { border:1px solid var(--line); border-radius:13px; background:#fff; overflow:hidden; }
    .event-card.open { border-color:#b8c6d8; box-shadow:0 7px 20px rgba(20,33,58,.06); }
    .event-card summary,.audit-summary { width:100%; display:grid; grid-template-columns:120px minmax(0,1fr) 140px 110px 24px; gap:14px; align-items:center; min-height:75px; padding:13px 16px; border:0; border-radius:0; cursor:pointer; list-style:none; text-align:left; background:#fff; box-shadow:none; }
    .event-card summary::-webkit-details-marker { display:none; }
    .event-card summary::after,.audit-summary::after { width:7px; height:7px; content:""; justify-self:end; border-right:1.5px solid var(--soft); border-bottom:1.5px solid var(--soft); transform:rotate(45deg); transition:transform .16s var(--ease-out); }
    .event-card.open summary::after,.audit-summary[aria-expanded="true"]::after { transform:rotate(225deg); }
    .event-message { min-width:0; }
    .event-message strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .event-route { margin-top:3px; overflow:hidden; color:var(--muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .event-time,.event-action { color:var(--muted); font-size:12px; }
    .event-action strong { display:block; color:var(--ink); text-transform:capitalize; }
    .event-details { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; padding:16px; border-top:1px solid var(--line); background:#f8fafc; }
    .detail-item { min-width:0; }
    .detail-label { display:block; margin-bottom:3px; color:var(--soft); font-size:10px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; }
    .detail-value { color:#34445e; overflow-wrap:anywhere; }
    .event-error { grid-column:1/-1; padding:10px 12px; border-radius:9px; color:var(--danger); background:var(--danger-bg); overflow-wrap:anywhere; }

    .mode-banner { display:flex; align-items:flex-start; gap:11px; margin-bottom:15px; padding:12px 14px; border:1px solid #f1d18c; border-radius:12px; color:#744708; background:#fffaec; }
    .mode-banner.info { color:#24539b; border-color:#c6d9f8; background:#f2f7ff; }
    .mode-icon { width:26px; height:26px; flex:0 0 auto; display:grid; place-items:center; border-radius:8px; color:var(--warning); background:#fff0bd; font-weight:900; }
    .mode-icon .icon { width:16px; height:16px; }
    .mode-banner.info .mode-icon { color:#285db9; background:#e4efff; }
    .mode-banner p { margin:2px 0 0; font-size:12px; }
    .quarantine-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; margin-bottom:14px; }
    .mini-stat { padding:11px 12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .mini-stat strong { display:block; color:var(--ink); font-size:18px; font-variant-numeric:tabular-nums; }
    .mini-stat span { color:var(--muted); font-size:10px; font-weight:750; letter-spacing:.04em; text-transform:uppercase; }
    .quarantine-layout { display:grid; grid-template-columns:minmax(280px,.78fr) minmax(0,1.42fr); min-height:520px; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:#fff; }
    .queue-column { min-width:0; border-right:1px solid var(--line); background:#f9fbfe; }
    .queue-list { max-height:700px; overflow:auto; }
    .queue-column .pagination-control { width:calc(100% - 20px); margin:10px; }
    .queue-item { width:100%; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 10px; min-height:104px; padding:14px; border:0; border-bottom:1px solid var(--line); border-radius:0; text-align:left; background:transparent; box-shadow:none; }
    .queue-item:hover:not(:disabled) { background:#f1f6fd; }
    .queue-item[aria-current="true"] { position:relative; background:#fff; box-shadow:inset 4px 0 var(--brand); }
    .queue-subject { min-width:0; overflow:hidden; color:var(--ink); font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
    .queue-sender { min-width:0; grid-column:1/-1; overflow:hidden; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
    .queue-meta { grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--muted); font-size:11px; }
    .review-pane { min-width:0; background:#fff; }
    .review-pane-empty { min-height:520px; display:grid; align-content:center; justify-items:center; padding:35px; color:var(--muted); text-align:center; }
    .review-content { min-width:0; }
    .review-top { position:sticky; z-index:2; top:0; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:17px 18px; border-bottom:1px solid var(--line); background:rgba(255,255,255,.96); backdrop-filter:blur(8px); }
    .review-title { min-width:0; }
    .review-title h3 { margin:5px 0 3px; font-size:19px; overflow-wrap:anywhere; }
    .review-actions { display:flex; justify-content:flex-end; gap:7px; flex-wrap:wrap; }
    .review-body { display:grid; gap:14px; padding:18px; }
    .review-section { min-width:0; padding:15px; border:1px solid var(--line); border-radius:12px; background:#fff; }
    .review-section h4 { margin:0 0 11px; font-size:13px; }
    .review-detail-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .score-line { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:9px; padding-bottom:9px; border-bottom:1px solid var(--line); }
    .score-value { font-size:22px; font-weight:850; font-variant-numeric:tabular-nums; }
    .reason-list,.attachment-list,.header-list { display:grid; gap:7px; margin:0; padding:0; list-style:none; }
    .reason-list li,.attachment-list li,.header-list li { min-width:0; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:9px 10px; border-radius:9px; color:#34445e; background:#f7f9fc; overflow-wrap:anywhere; }
    .header-list li { grid-template-columns:minmax(100px,.35fr) minmax(0,1fr); }
    .header-list strong { color:var(--muted); font-size:11px; }
    .message-preview { max-height:360px; margin:0; padding:14px; overflow:auto; border:1px solid var(--line); border-radius:9px; color:#25344d; background:#fbfcfe; font:13px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
    .preview-note { margin:0 0 10px; color:var(--muted); font-size:11px; }
    .timeline { position:relative; display:grid; gap:0; margin:0; padding:0; list-style:none; }
    .timeline li { position:relative; display:grid; grid-template-columns:12px minmax(0,1fr) auto; gap:10px; padding:0 0 16px; }
    .timeline li:last-child { padding-bottom:0; }
    .timeline li::before { width:10px; height:10px; margin-top:5px; content:""; border:2px solid #fff; border-radius:50%; background:#3b82f6; box-shadow:0 0 0 2px #a9c4f4; }
    .timeline li:not(:last-child)::after { position:absolute; top:15px; bottom:0; left:4px; width:2px; content:""; background:#d9e5f6; }
    .timeline strong { display:block; font-size:12px; text-transform:capitalize; }
    .timeline p { margin:2px 0 0; color:var(--muted); font-size:11px; }
    .timeline time { color:var(--soft); font-size:10px; white-space:nowrap; }
    .audit-detail { border-top:1px solid var(--line); background:#f8fafc; }
    .audit-detail > .review-body { padding:16px; }
    .audit-loading { padding:18px; color:var(--muted); }
    .retention-note { margin:0; color:var(--muted); font-size:11px; }
    .capture-banner { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:13px; padding:12px 14px; border:1px solid #b8cff3; border-radius:12px; color:#24539b; background:#f2f7ff; }
    .capture-banner.warning { color:var(--warning); border-color:#e8c57d; background:#fffaf0; }
    .capture-banner-copy { min-width:0; }
    .capture-banner-copy strong,.capture-banner-copy span { display:block; }
    .capture-banner-copy span { margin-top:2px; font-size:11px; overflow-wrap:anywhere; }
    .capture-banner-actions { flex:0 0 auto; display:flex; gap:7px; flex-wrap:wrap; }
    .delivery-list { display:grid; gap:9px; }
    .delivery-card { min-width:0; padding:12px; border:1px solid var(--line); border-radius:10px; background:#fafcff; }
    .delivery-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .delivery-heading h5 { margin:0; font-size:12px; }
    .delivery-heading p { margin:2px 0 0; color:var(--muted); font-size:10px; }
    .delivery-error { margin:10px 0 0; padding:8px 9px; border:1px solid #efb4ae; border-radius:8px; color:var(--danger); background:var(--danger-bg); font-size:11px; overflow-wrap:anywhere; }
    .delivery-manual-review { margin:10px 0 0; padding:9px 10px; border:1px solid #e8c57d; border-radius:8px; color:var(--warning); background:var(--warning-bg); font-size:11px; overflow-wrap:anywhere; }
    .delivery-subsection { margin-top:11px; padding-top:10px; border-top:1px solid var(--line); }
    .delivery-subsection h6 { margin:0 0 7px; color:#34445e; font-size:10px; letter-spacing:.04em; text-transform:uppercase; }
    .variable-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:0; }
    .variable-item { min-width:0; padding:8px 9px; border-radius:8px; background:#fff; }
    .variable-item dt { color:var(--muted); font:10px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap:anywhere; }
    .variable-item dd { margin:3px 0 0; color:#25344d; font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
    .attempt-list { display:grid; gap:6px; margin:0; padding:0; list-style:none; }
    .attempt-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:5px 10px; padding:8px 9px; border-radius:8px; background:#fff; }
    .attempt-item strong { font-size:11px; }
    .attempt-item time { color:var(--soft); font-size:10px; white-space:nowrap; }
    .attempt-item p { grid-column:1/-1; margin:0; color:var(--muted); font-size:10px; overflow-wrap:anywhere; }

    dialog.review-dialog { width:min(560px,calc(100% - 28px)); max-height:calc(100dvh - 24px); padding:0; overflow:hidden; border:0; border-radius:16px; color:var(--ink); background:#fff; box-shadow:0 28px 80px rgba(7,16,30,.3); opacity:0; transform:translateY(8px) scale(.985); transition:opacity .22s var(--ease-out),transform .22s var(--ease-out),overlay .22s allow-discrete,display .22s allow-discrete; }
    dialog.review-dialog form { max-height:calc(100dvh - 24px); display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
    dialog.review-dialog[open] { opacity:1; transform:none; }
    dialog.review-dialog::backdrop { background:rgba(7,16,30,0); transition:background .22s var(--ease-out),overlay .22s allow-discrete,display .22s allow-discrete; }
    dialog.review-dialog[open]::backdrop { background:rgba(7,16,30,.62); }
    @starting-style {
      dialog.review-dialog[open] { opacity:0; transform:translateY(8px) scale(.985); }
      dialog.review-dialog[open]::backdrop { background:rgba(7,16,30,0); }
    }
    .dialog-header { padding:20px 22px 14px; border-bottom:1px solid var(--line); }
    .dialog-header h2 { margin:0 0 5px; font-size:20px; }
    .dialog-header p { margin:0; color:var(--muted); }
    .dialog-body { display:grid; gap:14px; padding:18px 22px; overflow:auto; }
    .dialog-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 22px; border-top:1px solid var(--line); background:#f8fafc; }

    dialog.trainer-dialog { width:min(1120px,calc(100% - 28px)); height:min(780px,calc(100dvh - 24px)); }
    .trainer-shell { height:100%; display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
    .trainer-dialog .dialog-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
    .trainer-dialog .dialog-header > div { max-width:72ch; }
    .trainer-close { width:38px; min-height:38px; display:grid; place-items:center; flex:0 0 auto; padding:0; border-color:transparent; color:var(--muted); background:transparent; }
    .trainer-close .icon { width:19px; }
    .trainer-body { min-height:0; display:grid; grid-template-columns:minmax(0,1.12fr) minmax(340px,.88fr); overflow:hidden; }
    .trainer-sample-panel,.trainer-inspector { min-width:0; padding:20px 22px; overflow:auto; }
    .trainer-sample-panel { border-right:1px solid var(--line); }
    .trainer-panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
    .trainer-panel-heading h3 { margin:0; font-size:15px; }
    .trainer-panel-heading p { margin:3px 0 0; color:var(--muted); font-size:12px; }
    .trainer-addresses { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
    .trainer-sample-panel > .form-field { margin-bottom:10px; }
    .trainer-body-input { min-height:300px; line-height:1.6; tab-size:2; }
    .trainer-selection-state { min-height:50px; display:flex; align-items:center; gap:10px; margin-top:12px; padding:10px 12px; border:1px solid #c9d7e8; border-radius:10px; color:#34445e; background:#f5f8fd; }
    .trainer-selection-state.has-selection { color:var(--brand-tint-text); border-color:#a9c4f3; background:var(--brand-tint); }
    .trainer-selection-state strong { display:block; font-size:12px; }
    .trainer-selection-state span { display:block; margin-top:1px; font-size:11px; }
    .trainer-selection-icon { width:28px; height:28px; display:grid!important; place-items:center; flex:0 0 auto; margin:0!important; border-radius:8px; color:var(--brand-tint-text); background:#fff; font-weight:850; }
    .trainer-privacy { margin:0 0 14px; padding:10px 12px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); color:var(--muted); font-size:11px; }
    .trainer-inspector { display:grid; align-content:start; gap:20px; background:#fbfcfe; }
    .trainer-step { min-width:0; }
    .trainer-step + .trainer-step { padding-top:18px; border-top:1px solid var(--line); }
    .trainer-step h3 { margin-bottom:4px; font-size:14px; }
    .trainer-step > p { margin:0 0 11px; color:var(--muted); font-size:12px; }
    .trainer-create-line { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:end; }
    .trainer-create-line button { white-space:nowrap; }
    .trainer-template { min-height:132px; padding:13px 14px; overflow:auto; border:1px solid #263956; border-radius:11px; color:#e7eef9; background:#14233a; font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace; }
    .trainer-template-section + .trainer-template-section { margin-top:12px; padding-top:11px; border-top:1px solid #344660; }
    .trainer-template-label { display:block; margin-bottom:4px; color:#9fb0c8; font:700 10px/1.4 ui-sans-serif,system-ui,sans-serif; letter-spacing:.04em; text-transform:uppercase; }
    .trainer-template mark { padding:2px 4px; border-radius:5px; color:#fff; background:#2864c7; font-weight:800; }
    .trainer-template-empty { color:#b7c3d4; font-family:ui-sans-serif,system-ui,sans-serif; }
    .trainer-captures { display:grid; margin:0; padding:0; list-style:none; }
    .trainer-capture { min-width:0; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 8px; padding:10px 0; border-top:1px solid var(--line); }
    .trainer-capture:first-child { border-top:0; padding-top:0; }
    .trainer-capture code { color:var(--brand-tint-text); font-weight:800; overflow-wrap:anywhere; }
    .trainer-capture p { grid-column:1; margin:0; color:var(--muted); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .trainer-capture button { grid-column:2; grid-row:1/3; width:34px; min-height:34px; align-self:center; padding:0; border-color:transparent; color:var(--muted); background:transparent; }
    .trainer-capture button:hover:not(:disabled) { color:var(--danger); background:var(--danger-bg); }
    .trainer-capture-empty { padding:3px 0; color:var(--muted); font-size:12px; }
    .trainer-dialog .dialog-footer { align-items:center; justify-content:space-between; }
    .trainer-footer-note { margin:0; color:var(--muted); font-size:11px; }
    .trainer-footer-actions { display:flex; gap:8px; }

    dialog.parser-rule-dialog { width:min(720px,calc(100% - 28px)); }
    .parser-sample-summary { display:grid; gap:8px; padding:13px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .parser-sample-line { min-width:0; display:grid; grid-template-columns:72px minmax(0,1fr); gap:10px; font-size:12px; }
    .parser-sample-line strong { color:var(--muted); }
    .parser-sample-line span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .parser-body-status { margin:0; padding:10px 12px; border:1px solid #c6d9f8; border-radius:9px; color:#24539b; background:#f2f7ff; font-size:12px; }
    .parser-body-status.warning { color:var(--warning); border-color:#e8c57d; background:#fffaf0; }
    .parser-capture-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .parser-capture-actions p { margin:0; color:var(--muted); font-size:11px; }
    .parser-capture-config { min-width:0; flex:1 1 auto; display:grid; gap:9px; }
    .parser-capture-options { display:grid; grid-template-columns:minmax(170px,.7fr) minmax(0,1.3fr); gap:8px; }
    .outcome-fieldset { min-width:0; margin:0; padding:0; border:0; }
    .outcome-fieldset legend { margin-bottom:9px; color:#34445e; font-size:12px; font-weight:750; }
    .outcome-options { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .outcome-card { min-width:0; display:grid; grid-template-columns:20px minmax(0,1fr); gap:9px; align-items:start; padding:12px; border:1px solid var(--line); border-radius:11px; background:#fff; cursor:pointer; }
    .outcome-card:hover { border-color:#9cb3d0; background:#f8fbff; }
    .outcome-card:has(input:checked) { border-color:var(--brand); background:var(--brand-tint); box-shadow:0 0 0 1px var(--brand); }
    .outcome-card input { width:18px; min-height:18px; margin:2px 0 0; accent-color:var(--brand); }
    .outcome-card strong,.outcome-card span { display:block; }
    .outcome-card strong { font-size:13px; }
    .outcome-card span { margin-top:2px; color:var(--muted); font-size:11px; }
    .parser-route-field { padding:12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .draft-banner { display:flex; align-items:flex-start; gap:10px; margin:0 0 16px; padding:11px 12px; border:1px solid #c6d9f8; border-radius:10px; color:#24539b; background:#f2f7ff; }
    .draft-banner p { margin:2px 0 0; font-size:11px; }

    dialog.command-dialog { width:min(660px,calc(100% - 28px)); max-height:min(680px,calc(100vh - 40px)); margin-top:min(14vh,120px); padding:0; overflow:hidden; border:0; border-radius:16px; color:var(--ink); background:#fff; box-shadow:0 30px 90px rgba(7,16,30,.34); opacity:0; transform:translateY(-12px) scale(.985); transition:opacity .24s var(--ease-out),transform .24s var(--ease-out),overlay .24s allow-discrete,display .24s allow-discrete; }
    dialog.command-dialog[open] { opacity:1; transform:none; }
    dialog.command-dialog::backdrop { background:rgba(7,16,30,0); transition:background .24s var(--ease-out),overlay .24s allow-discrete,display .24s allow-discrete; }
    dialog.command-dialog[open]::backdrop { background:rgba(7,16,30,.7); }
    @starting-style {
      dialog.command-dialog[open] { opacity:0; transform:translateY(-12px) scale(.985); }
      dialog.command-dialog[open]::backdrop { background:rgba(7,16,30,0); }
    }
    .command-shell { display:grid; grid-template-rows:auto minmax(0,1fr) auto; max-height:min(680px,calc(100vh - 40px)); }
    .command-search { position:relative; display:flex; align-items:center; padding:14px; border-bottom:1px solid var(--line); }
    .command-search .icon { position:absolute; left:27px; color:var(--muted); pointer-events:none; }
    .command-search input { min-height:50px; padding:11px 48px 11px 43px; border:0; border-radius:10px; background:#f1f5f9; font-size:16px; }
    .command-search input:focus { outline:2px solid var(--focus-canvas); outline-offset:1px; box-shadow:0 0 0 4px var(--focus-navigation); }
    .command-close { position:absolute; right:21px; width:34px; min-height:34px; display:grid; place-items:center; padding:0; border-color:transparent; color:var(--muted); background:transparent; }
    .command-close .icon { position:static; width:18px; }
    .command-list { display:grid; gap:3px; margin:0; padding:8px; overflow:auto; list-style:none; }
    #commandResults { min-height:0; overflow:auto; }
    .command-item { margin:0; }
    .command-button { width:100%; min-height:56px; display:grid; grid-template-columns:34px minmax(0,1fr) auto; gap:10px; align-items:center; padding:9px 11px; border-color:transparent; text-align:left; background:transparent; box-shadow:none; }
    .command-button:hover:not(:disabled),.command-button[aria-selected="true"] { border-color:transparent; color:var(--ink); background:var(--brand-tint); }
    .command-icon { width:34px; height:34px; display:grid; place-items:center; border-radius:9px; color:var(--brand-tint-text); background:#fff; }
    .command-icon .icon { width:17px; height:17px; }
    .command-copy { min-width:0; }
    .command-copy strong,.command-copy span { display:block; }
    .command-copy strong { font-size:13px; }
    .command-copy span { color:var(--muted); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .command-group { padding:11px 12px 5px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; }
    .command-key { color:var(--muted); font-size:11px; }
    .command-empty { padding:36px 18px; color:var(--muted); text-align:center; }
    .command-footer { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:10px 14px; border-top:1px solid var(--line); color:var(--muted); background:#f8fafc; font-size:11px; }
    .command-hints { display:flex; align-items:center; gap:12px; }
    .command-hints span { display:flex; align-items:center; gap:5px; }
    .command-footer kbd { color:#526178; border-color:#c4ceda; background:#fff; box-shadow:0 1px 0 #aab6c5; }
    dialog.webhook-audit-dialog { width:min(920px,calc(100% - 28px)); height:min(760px,calc(100dvh - 32px)); max-height:calc(100dvh - 32px); margin:auto; padding:0; overflow:hidden; border:0; border-radius:16px; color:var(--ink); background:#fff; box-shadow:0 30px 90px rgba(7,16,30,.34); }
    .webhook-audit-shell { height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
    .webhook-audit-fields { min-height:0; display:grid; align-content:start; gap:8px; padding:14px 18px; overflow:auto; }
    .webhook-audit-field { min-width:0; display:grid; grid-template-columns:92px minmax(130px,.8fr) minmax(140px,1fr) minmax(180px,1.3fr); gap:10px; align-items:center; padding:10px; border:1px solid var(--line); border-radius:10px; background:#fbfcfe; }
    .webhook-audit-field input[type="text"],.webhook-audit-field input:not([type]) { min-height:36px; padding:7px 9px; }
    .webhook-audit-required { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:12px; font-weight:700; white-space:nowrap; }
    .webhook-audit-required input { width:17px; min-height:17px; }
    .webhook-audit-path { min-width:0; overflow:hidden; color:var(--brand-tint-text); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
    .webhook-audit-value { max-height:58px; overflow:auto; padding:7px 9px; border:1px solid #263956; border-radius:8px; color:#e7eef9; background:#14233a; font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; }
    .webhook-audit-dialog-note { margin:0; padding:0 18px 12px; color:var(--muted); font-size:11px; }
    @media (max-width:700px) {
      dialog.webhook-audit-dialog { width:calc(100% - 16px); height:calc(100dvh - 16px); max-height:calc(100dvh - 16px); }
      .webhook-audit-field { grid-template-columns:1fr 1fr; gap:7px 10px; }
      .webhook-audit-required { grid-column:1/-1; }
      .webhook-audit-path,.webhook-audit-value { grid-column:1/-1; }
    }

    .active-panel { animation:panel-new .32s var(--ease-out) both; }
    #ruleForm:not(.hidden),#jsonEditor:not(.hidden) { view-transition-name:editor-surface; }
    ::view-transition-old(editor-surface) { animation:panel-old .14s ease-in both; }
    ::view-transition-new(editor-surface) { animation:panel-new .32s var(--ease-out) both; }
    @keyframes panel-old { to { opacity:0; transform:translateY(3px); } }
    @keyframes panel-new { from { opacity:0; clip-path:inset(0 0 8% 0 round 12px); transform:translateY(6px); } }

    .test-layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:16px; align-items:start; }
    .test-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .test-result { position:sticky; top:16px; min-height:0; align-self:start; padding:16px; border:1px solid var(--line); border-radius:15px; background:#f9fbfe; }
    .test-result.has-error { border-color:#efb4ae; background:#fff9f8; }
    .result-empty { min-height:0; display:grid; grid-template-columns:42px minmax(0,1fr); grid-template-rows:auto auto; gap:2px 12px; align-items:center; justify-items:start; padding:4px; color:var(--muted); text-align:left; }
    .result-empty h3,.result-empty p { margin:0; }
    .result-orb { grid-row:1/-1; width:42px; height:42px; display:grid; place-items:center; margin:0; border-radius:13px; color:#3467c1; background:#e8f0ff; font-size:20px; font-weight:850; }
    .result-orb .icon { width:21px; height:21px; }
    .test-result.is-evaluating .result-orb .icon { animation:busy-spin .7s linear infinite; }
    .test-result.has-error .result-orb { color:var(--danger); background:var(--danger-bg); }
    .decision-heading { display:flex; align-items:center; gap:11px; margin-bottom:18px; }
    .decision-icon { width:44px; height:44px; display:grid; place-items:center; border-radius:13px; color:#215bbd; background:#e8f0ff; font-size:18px; font-weight:900; }
    .decision-icon .icon { width:21px; height:21px; }
    .decision-icon.quarantine { color:var(--warning); background:var(--warning-bg); }
    .decision-icon.reject,.decision-icon.drop { color:var(--danger); background:var(--danger-bg); }
    .decision-heading h3 { margin:0; font-size:18px; text-transform:capitalize; }
    .decision-grid { display:grid; gap:10px; }
    .decision-row { padding:10px 0; border-top:1px solid var(--line); }
    .decision-row:first-child { border-top:0; }
    .decision-row .detail-label { margin-bottom:4px; }
    .raw-result { margin-top:14px; }
    .raw-result summary { color:var(--muted); cursor:pointer; font-size:12px; font-weight:700; }
    .raw-result pre { max-height:260px; margin-top:9px; padding:12px; border-radius:9px; color:var(--navigation-contrast); background:var(--navigation); font-size:11px; }

    .setup-hero { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-bottom:16px; padding:16px 18px; border:1px solid var(--line); border-radius:14px; background:#f9fbfe; }
    .setup-hero-copy { min-width:0; display:flex; align-items:center; gap:13px; }
    .setup-orb { width:42px; height:42px; flex:0 0 auto; display:grid; place-items:center; border-radius:13px; color:var(--warning); background:var(--warning-bg); font-weight:900; }
    .setup-orb .icon { width:20px; height:20px; }
    .setup-orb.ready { color:var(--success); background:var(--success-bg); }
    .setup-hero h3 { margin:0 0 2px; font-size:16px; }
    .setup-hero p { margin:0; color:var(--muted); font-size:12px; }
    .setup-profile { flex:0 0 auto; text-align:right; }
    .setup-profile strong { display:block; font-size:13px; }
    .setup-grid { display:grid; grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr); gap:14px; }
    .setup-card { min-width:0; padding:17px; border:1px solid var(--line); border-radius:14px; background:#fff; }
    .setup-card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .setup-card-heading p { margin:2px 0 0; color:var(--muted); font-size:12px; }
    .setup-checks { display:grid; gap:8px; }
    .setup-check { display:grid; grid-template-columns:30px minmax(0,1fr) auto; gap:10px; align-items:center; padding:11px 12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .setup-check-icon { width:28px; height:28px; display:grid; place-items:center; border-radius:9px; color:var(--muted); background:var(--slate-bg); font-size:12px; font-weight:900; }
    .setup-check-icon .icon { width:16px; height:16px; }
    .setup-check-icon.ready { color:var(--success); background:var(--success-bg); }
    .setup-check-icon.optional { color:#285db9; background:#eaf1ff; }
    .setup-check-icon.missing { color:var(--danger); background:var(--danger-bg); }
    .setup-check-copy { min-width:0; }
    .setup-check-copy strong { display:block; font-size:13px; overflow-wrap:anywhere; }
    .setup-check-copy span { display:block; margin-top:2px; color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
    .setup-state { padding:4px 8px; border-radius:999px; color:#536174; background:var(--slate-bg); font-size:9px; font-weight:850; letter-spacing:.04em; text-transform:uppercase; }
    .setup-state.ready { color:var(--success); background:var(--success-bg); }
    .setup-state.optional { color:#285db9; background:#eaf1ff; }
    .setup-state.missing { color:var(--danger); background:var(--danger-bg); }
    .integration-details { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
    .integration-detail { min-width:0; padding:10px 11px; border:1px solid var(--line); border-radius:10px; background:#fafcff; }
    .integration-detail.wide { grid-column:1/-1; }
    .integration-detail strong { display:block; overflow-wrap:anywhere; }
    .command-block { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:stretch; margin-top:7px; }
    .command-block code { min-width:0; display:flex; align-items:center; padding:10px 11px; overflow:auto; border:1px solid var(--navigation-border); border-radius:10px; color:var(--navigation-contrast); background:var(--navigation); font-size:11px; white-space:nowrap; }
    .setup-secret-note { margin:9px 0 14px; color:var(--muted); font-size:11px; }
    .catalog-summary { margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
    .catalog-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:9px; }
    .catalog-heading p { margin:0; color:var(--muted); font-size:11px; }
    .catalog-counts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
    .catalog-count { min-width:0; padding:9px; border-radius:9px; background:#f4f7fb; }
    .catalog-count strong { display:block; font-size:17px; font-variant-numeric:tabular-nums; }
    .catalog-count span { display:block; overflow:hidden; color:var(--muted); font-size:9px; font-weight:750; text-overflow:ellipsis; text-transform:capitalize; white-space:nowrap; }
    .setup-extensions { display:grid; grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr); gap:14px; margin-top:14px; }
    .mailbox-card { grid-column:1/-1; }
    .mailbox-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .mailbox-row { min-width:0; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .mailbox-row-heading { min-width:0; }
    .mailbox-row-heading h4 { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin:0; font-size:13px; }
    .mailbox-address { display:block; margin-top:4px; color:var(--muted); font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap:anywhere; }
    .mailbox-actions { display:flex; justify-content:flex-end; gap:5px; flex-wrap:wrap; }
    .mailbox-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; align-items:start; margin-top:12px; padding:13px; border:1px solid #b9c9df; border-radius:11px; background:#f8fbff; }
    .mailbox-form-heading,.mailbox-form .form-actions,.mailbox-form .error { grid-column:1/-1; }
    .mailbox-form-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .mailbox-form-heading h4 { margin:0; font-size:13px; }
    .mailbox-form-heading p { margin:2px 0 0; color:var(--muted); font-size:10px; }
    .mailbox-form .inline-check { align-self:center; }
    .source-list { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .source-row { min-width:0; display:grid; gap:9px; padding:12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .source-row-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .source-row-heading h4 { margin:0; font-size:13px; }
    .source-row-heading p { margin:3px 0 0; color:var(--muted); font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap:anywhere; }
    .source-row-meta { display:flex; gap:6px; flex-wrap:wrap; }
    .source-row-actions { display:flex; justify-content:flex-end; gap:6px; flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--line); }
    .source-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-items:start; margin-top:12px; padding:14px; border:1px solid #b9c9df; border-radius:11px; background:#f8fbff; }
    .source-form-heading,.source-form .source-mappings,.source-form .error,.source-form .form-actions { grid-column:1/-1; }
    .source-form-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .source-form-heading h4 { margin:0; font-size:13px; }
    .source-form-heading p { margin:2px 0 0; color:var(--muted); font-size:10px; }
    .input-prefix { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:stretch; }
    .input-prefix span { display:flex; align-items:center; padding:0 9px; border:1px solid #9caec4; border-right:0; border-radius:8px 0 0 8px; color:var(--muted); background:#edf2f8; font:11px ui-monospace,SFMono-Regular,Consolas,monospace; }
    .input-prefix input { border-radius:0 8px 8px 0; }
    .source-token { display:grid; grid-template-columns:minmax(180px,.6fr) minmax(0,1fr) auto; gap:10px; align-items:center; margin-bottom:12px; padding:12px; border:1px solid #9bc6ae; border-radius:11px; color:#245c3c; background:#f0fbf5; }
    .source-token strong,.source-token span { display:block; }
    .source-token span { margin-top:2px; font-size:10px; }
    .source-token code { min-width:0; padding:8px 9px; overflow:auto; border-radius:8px; color:#e7eef9; background:#14233a; white-space:nowrap; }
    .compact-card-heading { align-items:center; }
    .compact-card-heading .toolbar { flex:0 0 auto; }
    .directory-toolbar { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:9px; align-items:end; margin-bottom:12px; }
    .directory-status { margin:0; color:var(--muted); font-size:11px; text-align:right; }
    .compact-list { display:grid; gap:8px; }
    .compact-row { min-width:0; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:11px 12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .compact-row-copy { min-width:0; }
    .compact-row-copy strong,.compact-row-copy span { display:block; overflow-wrap:anywhere; }
    .compact-row-copy span { margin-top:3px; color:var(--muted); font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; }
    .client-directory-list,.webhook-list { max-height:440px; overflow:auto; padding-right:2px; }
    .directory-row,.webhook-row { min-width:0; padding:12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .directory-row-heading,.webhook-row-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .directory-heading-actions { display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-wrap:wrap; }
    .directory-row-heading h4,.webhook-row-heading h4 { margin:0; font-size:13px; overflow-wrap:anywhere; }
    .directory-row-heading p,.webhook-row-heading p { margin:2px 0 0; color:var(--muted); font-size:10px; overflow-wrap:anywhere; }
    .directory-identifiers { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
    .alias-section { display:grid; gap:6px; margin-top:9px; padding-top:9px; border-top:1px solid var(--line); }
    .alias-section-label { color:var(--muted); font-size:10px; font-weight:750; }
    .alias-groups { display:grid; gap:7px; }
    .alias-group { display:grid; grid-template-columns:minmax(72px,.3fr) minmax(0,1fr); gap:7px; align-items:start; }
    .alias-scope-label { padding-top:5px; color:var(--muted); font-size:10px; font-weight:750; overflow-wrap:anywhere; }
    .alias-chips { display:flex; gap:5px; flex-wrap:wrap; }
    .alias-chip { max-width:100%; display:inline-flex; align-items:center; gap:4px; padding:3px 4px 3px 8px; border:1px solid #cbd7e5; border-radius:999px; color:#34445e; background:#fff; font-size:11px; overflow-wrap:anywhere; }
    .alias-chip button { min-width:25px; min-height:25px; padding:0; border:0; border-radius:999px; color:var(--muted); background:transparent; font-size:14px; }
    .alias-chip .alias-edit { min-width:auto; padding-inline:6px; font-size:10px; }
    .alias-chip .alias-edit:hover:not(:disabled) { color:var(--brand-text); background:var(--brand-tint); }
    .alias-chip .alias-remove:hover:not(:disabled) { color:var(--danger); background:var(--danger-bg); }
    .inline-setup-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(130px,.45fr); gap:12px; align-items:start; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
    .inline-setup-form .alias-values-field { grid-column:1/-1; }
    .inline-setup-form textarea { min-height:88px; }
    .form-actions { grid-column:1/-1; display:flex; align-items:center; justify-content:flex-end; gap:8px; }
    .form-actions button { white-space:nowrap; }
    .alias-resolution-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(130px,.45fr); gap:12px; align-items:start; margin-top:12px; padding:12px; border:1px solid var(--line); border-radius:11px; background:#fafcff; }
    .alias-resolution-form .resolution-result { grid-column:1/-1; min-height:18px; margin:0; color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
    .alias-resolution-form .resolution-result.resolved { color:var(--success); }
    .alias-resolution-form .resolution-result.unresolved { color:var(--warning); }
    .webhook-posture { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:10px; }
    .posture-item { min-width:0; padding:9px 10px; border-radius:9px; background:#f4f7fb; }
    .posture-item strong { display:block; margin-top:2px; font-size:12px; overflow-wrap:anywhere; }
    .allowed-hosts { grid-column:1/-1; }
    .webhook-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:9px; align-items:center; }
    .webhook-url { display:block; margin-top:4px; color:var(--muted); font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap:anywhere; }
    .webhook-actions { display:flex; gap:5px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .webhook-form { display:grid; gap:10px; margin-top:12px; padding:12px; border:1px solid #b9c9df; border-radius:11px; background:#f8fbff; }
    .webhook-form-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .webhook-form-heading h4 { margin:0; font-size:13px; }
    .webhook-form-heading p { margin:2px 0 0; color:var(--muted); font-size:10px; }
    .webhook-form-grid { display:grid; grid-template-columns:minmax(130px,.65fr) minmax(220px,1.35fr); gap:12px; }
    .webhook-form-actions { display:flex; justify-content:flex-end; gap:7px; }

    .toast-region { position:fixed; z-index:100; right:18px; bottom:18px; width:min(380px,calc(100% - 36px)); display:grid; gap:8px; pointer-events:none; }
    .toast { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:12px 13px; border:1px solid #bedacb; border-radius:12px; color:#135b43; background:#effbf6; box-shadow:0 16px 40px rgba(20,33,58,.16); pointer-events:auto; animation:toast-in .2s ease-out; }
    .toast.error-tone { color:var(--danger); border-color:#efb4ae; background:#fff4f2; }
    .toast button { min-height:28px; padding:2px 7px; border:0; color:inherit; background:transparent; }
    @keyframes toast-in { from { opacity:0; transform:translateY(8px); } }

    @media (min-width:931px) and (max-width:1050px) {
      .webhook-form-grid { grid-template-columns:1fr; }
    }

    @media (max-width:930px) {
      .login-layout { grid-template-columns:1fr; gap:20px; padding-block:15px 30px; }
      .login-hero { padding-bottom:0; }
      .login-hero h2 { max-width:760px; }
      .login-card { max-width:650px; }
      .stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .stat-card:nth-child(odd) { border-left:0; }
      .stat-card:nth-child(n+3) { border-top:1px solid var(--line); }
      .rule-card { grid-template-columns:64px minmax(0,1fr); }
      .rule-actions { grid-column:2; justify-content:flex-start; }
      .event-card summary,.audit-summary { grid-template-columns:105px minmax(0,1fr) 120px 24px; }
      .event-action { display:none; }
      .test-layout { grid-template-columns:1fr; }
      .test-result { position:static; }
      .setup-grid { grid-template-columns:1fr; }
      .setup-extensions { grid-template-columns:1fr; }
      .mailbox-list,.source-list { grid-template-columns:1fr; }
      .quarantine-layout { grid-template-columns:minmax(250px,.8fr) minmax(0,1.2fr); }
      .review-detail-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      dialog.trainer-dialog { height:calc(100dvh - 20px); }
      .trainer-body { grid-template-columns:1fr; overflow:auto; }
      .trainer-sample-panel,.trainer-inspector { overflow:visible; }
      .trainer-sample-panel { border-right:0; border-bottom:1px solid var(--line); }
      .trainer-body-input { min-height:240px; }
      .outcome-options { grid-template-columns:1fr; }
    }
    @media (max-width:700px) {
      .shell { width:min(100% - 24px,1180px); }
      .header-inner { min-height:74px; }
      .brand-subtitle,.connection-pill { display:none; }
      .session-controls { gap:7px; }
      .command-trigger-label,.command-trigger kbd { display:none; }
      .command-trigger { width:38px; min-height:36px; justify-content:center; padding:6px; }
      .brand-mark { width:38px; height:38px; }
      main.shell { padding-block:18px 40px; }
      .login-layout { min-height:auto; }
      .login-card { order:-1; }
      .login-hero h2 { font-size:36px; }
      .flow-line { flex-wrap:wrap; }
      .workspace-heading { align-items:flex-start; flex-direction:column; }
      #workspace { padding-bottom:76px; }
      #workspace.editor-active { padding-bottom:0; }
      #workspace.editor-active .tabs { display:none; }
      .tabs { position:fixed; z-index:80; right:12px; bottom:max(10px,env(safe-area-inset-bottom)); left:12px; margin:0; padding:5px; overflow:visible; border-color:#c8d2df; border-radius:14px; background:rgba(233,238,245,.96); box-shadow:0 15px 40px rgba(7,16,30,.22); }
      .tabs button { min-width:0; flex:1 1 0; justify-content:center; gap:4px; padding-inline:6px; font-size:11px; }
      .tabs .tab-count { display:none; }
      .tab-icon { width:15px; height:15px; }
      .stats-grid { grid-template-columns:1fr 1fr; }
      .panel { padding:16px; }
      .panel-header,.editor-topline { align-items:stretch; flex-direction:column; }
      .editor-controls { width:100%; display:grid; grid-template-columns:1fr; align-items:start; }
      .editor-controls .form-field { min-width:0; }
      .editor-controls button { width:100%; }
      .toolbar > button,.toolbar > select { flex:1; }
      .rule-card { grid-template-columns:55px minmax(0,1fr); padding-right:12px; }
      .rule-actions { gap:5px; flex-wrap:wrap; }
      .form-grid,.condition-grid,.test-form-grid,.webhook-action-grid,.extraction-core,.extraction-source-fields,.extraction-options,.client-linkage,.gorelo-action-grid,.gorelo-assignment-row { grid-template-columns:1fr; }
      .span-2 { grid-column:auto; }
      .gorelo-action-grid .wide,.gorelo-flags { grid-column:auto; }
      .gorelo-variable-bar { grid-template-columns:1fr; }
      .gorelo-assignment-dynamic { grid-template-columns:1fr; }
      .check-field { padding-top:3px; }
      .condition-row { grid-template-columns:30px minmax(0,1fr); }
      .condition-meta .inline-check input[data-role="header-name"] { width:100%; min-width:0; }
      .remove-condition { grid-column:2; width:auto; margin:0; justify-self:start; padding-inline:8px; font-size:13px; }
      .extraction-row { grid-template-columns:30px minmax(0,1fr); }
      .remove-extraction { grid-column:2; width:auto; margin:0; justify-self:start; padding-inline:8px; font-size:13px; }
      .extraction-checks { grid-column:auto; }
      .extraction-start,.extraction-end,.extraction-default { grid-column:auto; }
      .webhook-destination-line { grid-template-columns:1fr; }
      .editor-footer { margin-inline:-16px; margin-bottom:-16px; padding:12px 16px; align-items:stretch; flex-direction:column; }
      .editor-footer p { display:none; }
      .editor-actions { display:grid; grid-template-columns:1fr 1fr; }
      .filter-bar { grid-template-columns:1fr 1fr; }
      .filter-bar .refresh-events,.filter-bar .refresh-quarantine { grid-column:1/-1; }
      .event-card summary,.audit-summary { grid-template-columns:1fr auto; gap:8px; }
      .event-card summary::after,.audit-summary::after { grid-column:2; grid-row:1; }
      .event-message { grid-column:1/-1; grid-row:2; }
      .event-time { grid-column:1/-1; }
      .event-details { grid-template-columns:1fr; }
      .event-error { grid-column:auto; }
      .quarantine-metrics { grid-template-columns:1fr 1fr; }
      .quarantine-layout { grid-template-columns:1fr; }
      .queue-column { border-right:0; border-bottom:1px solid var(--line); }
      .queue-list { max-height:360px; }
      .review-top { position:static; align-items:stretch; flex-direction:column; }
      .review-actions { display:grid; grid-template-columns:1fr 1fr; }
      .review-actions button { width:100%; }
      .review-detail-grid { grid-template-columns:1fr; }
      .variable-list { grid-template-columns:1fr; }
      .attempt-item { grid-template-columns:1fr; }
      .attempt-item time,.attempt-item p { grid-column:1; }
      .setup-hero { align-items:flex-start; flex-direction:column; }
      .setup-profile { text-align:left; }
      .inline-setup-form,.alias-resolution-form,.webhook-form-grid,.mailbox-form,.source-form { grid-template-columns:1fr; }
      .mailbox-form-heading,.mailbox-form .form-actions,.mailbox-form .error { grid-column:auto; }
      .source-form-heading,.source-form .source-mappings,.source-form .error,.source-form .form-actions { grid-column:auto; }
      .source-token { grid-template-columns:1fr; }
      .mailbox-row { grid-template-columns:1fr; }
      .mailbox-actions { justify-content:flex-start; }
      .capture-banner,.parser-capture-actions { align-items:stretch; flex-direction:column; }
      .parser-capture-options { grid-template-columns:1fr; }
      .inline-setup-form .alias-values-field,.inline-setup-form .form-actions,.alias-resolution-form .form-actions,.alias-resolution-form .resolution-result { grid-column:auto; }
      .inline-setup-form .form-actions,.alias-resolution-form .form-actions { display:grid; grid-template-columns:1fr; }
      .inline-setup-form .form-actions button,.alias-resolution-form .form-actions button { width:100%; }
      .alias-group { grid-template-columns:1fr; gap:3px; }
      .directory-toolbar { grid-template-columns:1fr; }
      .directory-status { text-align:left; }
      .webhook-row { grid-template-columns:1fr; }
      .webhook-actions { justify-content:flex-start; }
      .extraction-heading { align-items:stretch; flex-direction:column; }
      .extraction-actions { justify-content:flex-start; }
      .trainer-addresses,.trainer-create-line { grid-template-columns:1fr; }
      .trainer-create-line button { width:100%; }
      .trainer-dialog .dialog-footer { align-items:stretch; flex-direction:column; }
      .trainer-footer-actions { display:grid; grid-template-columns:1fr 1fr; }
    }
    @media (max-width:460px) {
      .header-button { min-height:36px; padding:6px 9px; }
      .login-hero h2 { font-size:32px; }
      .login-card { padding:22px; }
      .stats-grid { grid-template-columns:1fr 1fr; gap:0; }
      .stat-card { min-height:78px; padding:12px; }
      .stat-icon { width:32px; height:32px; }
      .stat-value { font-size:19px; }
      .stat-label { font-size:10px; }
      .rule-card { grid-template-columns:1fr; padding:14px; }
      .priority { justify-items:start; padding:0; }
      .priority strong,.priority span { display:inline; margin-right:4px; font-size:11px; }
      .rule-actions { grid-column:1; }
      .filter-bar { grid-template-columns:1fr; }
      .filter-bar .refresh-events,.filter-bar .refresh-quarantine { grid-column:auto; }
      .quarantine-metrics { grid-template-columns:1fr 1fr; }
      .review-actions,.dialog-footer { grid-template-columns:1fr; display:grid; }
      .header-list li { grid-template-columns:1fr; }
      .integration-details,.catalog-counts { grid-template-columns:1fr; }
      .integration-detail.wide { grid-column:auto; }
      .command-block { grid-template-columns:1fr; }
      dialog.command-dialog { width:calc(100% - 20px); max-height:calc(100vh - 20px); margin-top:10px; }
      .command-shell { max-height:calc(100vh - 20px); }
      .command-footer { display:none; }
      dialog.trainer-dialog { width:calc(100% - 12px); height:calc(100dvh - 12px); max-height:calc(100dvh - 12px); }
      .trainer-dialog .dialog-header,.trainer-sample-panel,.trainer-inspector { padding-inline:16px; }
      .trainer-panel-heading { align-items:stretch; flex-direction:column; }
      .trainer-panel-heading button { width:100%; }
      .trainer-footer-actions { grid-template-columns:1fr; }
    }
    @media (pointer:coarse) {
      button.small,.alias-chip button,.toast button,.command-close { min-width:44px; min-height:44px; }
    }
    @media (prefers-reduced-motion:reduce) {
      *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#mainContent">Skip to main content</a>
  <header class="app-header">
    <div class="shell header-inner container-xl">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M4 7.5h10.5a4.5 4.5 0 0 1 4.5 4.5v5"/><path d="m15 14 4 4 4-4"/><path d="M4 16.5h6"/></svg></div>
        <div>
          <h1>Gorelo Router</h1>
          <p class="brand-subtitle">Inbound policy and ticket routing</p>
        </div>
      </div>
      <div id="sessionControls" class="session-controls hidden">
        <div class="connection-pill"><span id="connectionDot" class="status-dot" aria-hidden="true"></span><span id="connectionLabel">Session active</span></div>
        <button id="commandTrigger" class="btn header-button small command-trigger" type="button" aria-label="Open command menu" aria-haspopup="dialog" aria-controls="commandDialog" aria-keyshortcuts="Control+K Meta+K"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><span class="command-trigger-label">Commands</span><kbd aria-hidden="true">⌘K</kbd></button>
        <button id="disconnect" class="btn header-button small" type="button">Disconnect</button>
      </div>
    </div>
  </header>

  <main id="mainContent" class="shell container-xl">
    <section id="login" class="login-layout" aria-labelledby="loginHeading">
      <div class="login-hero">
        <h2 id="loginHeading">Turn inbound noise into the right Gorelo ticket.</h2>
        <p>Inspect, classify, and route every alert before it reaches your service desk—without giving up the original message or attachments.</p>
        <div class="flow-line" aria-label="Mail processing flow">
          <span class="flow-node">Cloudflare Email</span><span class="flow-arrow" aria-hidden="true">→</span>
          <span class="flow-node">Policy engine</span><span class="flow-arrow" aria-hidden="true">→</span>
          <span class="flow-node">Gorelo RMM</span>
        </div>
      </div>
      <form id="loginForm" class="login-card card">
        <h2>Connect to Gorelo Router</h2>
        <p class="muted">Use the admin token configured for this deployment.</p>
        <div class="form-field">
          <label for="token">Admin API token</label>
          <input id="token" class="form-control" type="password" autocomplete="off" required aria-describedby="tokenHelp" placeholder="Paste your 32+ character token">
          <span id="tokenHelp" class="field-help">The token stays in page memory and is cleared from this field after connection.</span>
        </div>
        <div class="login-actions">
          <button id="connect" class="btn btn-primary primary" type="submit">Connect securely</button>
        </div>
        <p id="loginError" class="error" role="alert" aria-live="assertive"></p>
        <p class="security-note"><span class="security-icon" aria-hidden="true">✓</span><span>No browser storage. No token in the URL. Every API response is non-cacheable.</span></p>
      </form>
    </section>

    <section id="workspace" class="hidden" aria-labelledby="workspaceTitle">
      <div class="workspace-heading">
        <div>
          <h2 id="workspaceTitle" tabindex="-1">Mail routing overview</h2>
          <p>Rules are evaluated from the lowest priority number upward.</p>
        </div>
        <div class="ready-label"><span class="status-dot" aria-hidden="true"></span><span id="lastRefreshLabel">Policy database ready</span></div>
      </div>

      <nav id="primaryTabs" class="tabs nav nav-pills" role="tablist" aria-label="Gorelo Router sections" data-indicator-ready="false">
        <span class="tab-indicator" aria-hidden="true"></span>
        <button id="rulesTabButton" class="nav-link active" type="button" role="tab" aria-selected="true" aria-controls="rulesTab" tabindex="0" data-tab="rules"><svg class="icon tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></svg><span>Rules</span><span id="ruleTabCount" class="tab-count">0</span></button>
        <button id="quarantineTabButton" class="nav-link" type="button" role="tab" aria-selected="false" aria-controls="quarantineTab" tabindex="-1" data-tab="quarantine"><svg class="icon tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7v5c0 4.5-3.3 7.5-8 9-4.7-1.5-8-4.5-8-9V7z"/><path d="M12 8v4M12 16h.01"/></svg><span>Quarantine</span><span id="quarantineTabCount" class="tab-count">0</span></button>
        <button id="auditTabButton" class="nav-link" type="button" role="tab" aria-selected="false" aria-controls="auditTab" tabindex="-1" data-tab="audit"><svg class="icon tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 15h6"/></svg><span>Audit</span><span id="auditTabCount" class="tab-count">0</span></button>
        <button id="testTabButton" class="nav-link" type="button" role="tab" aria-selected="false" aria-controls="testTab" tabindex="-1" data-tab="test"><svg class="icon tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8"/></svg><span>Dry run</span></button>
        <button id="setupTabButton" class="nav-link" type="button" role="tab" aria-selected="false" aria-controls="setupTab" tabindex="-1" data-tab="setup"><svg class="icon tab-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg><span>Setup</span></button>
      </nav>

      <section class="stats-grid" aria-label="Routing summary">
        <div class="stat-card"><div class="stat-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></svg></div><div><strong id="enabledRuleCount" class="stat-value">—</strong><span class="stat-label">Enabled rules</span></div></div>
        <div class="stat-card"><div class="stat-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3 20 7v5c0 4.5-3.3 7.5-8 9-4.7-1.5-8-4.5-8-9V7z"/><path d="M12 8v4M12 16h.01"/></svg></div><div><strong id="pendingQuarantineCount" class="stat-value">—</strong><span class="stat-label">Needs review</span></div></div>
        <div class="stat-card warning"><div class="stat-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3 22 20H2z"/><path d="M12 9v4M12 17h.01"/></svg></div><div><strong id="failureCount" class="stat-value">—</strong><span class="stat-label">Recent processing failures</span></div></div>
        <div class="stat-card"><div class="stat-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3 20 7v5c0 4.5-3.3 7.5-8 9-4.7-1.5-8-4.5-8-9V7z"/><path d="m9 12 2 2 4-4"/></svg></div><div><strong id="spamPostureValue" class="stat-value">—</strong><span id="spamPostureLabel" class="stat-label">Loading spam policy</span></div></div>
      </section>

      <div id="rulesTab" role="tabpanel" aria-labelledby="rulesTabButton">
        <section class="panel card" aria-labelledby="rulesHeading">
          <div class="panel-header">
            <div><h2 id="rulesHeading" tabindex="-1">Routing rules</h2><p>First match wins. Forward rules respect global spam policy unless explicitly bypassed.</p></div>
            <div class="toolbar"><button id="refreshRules" class="btn" type="button">Refresh</button><button id="newRule" class="btn btn-primary primary" type="button">+ New rule</button></div>
          </div>
          <p id="rulesNotice" class="error" role="alert" aria-live="assertive"></p>
          <div id="rules" class="rule-list" role="list" aria-live="polite"></div>
        </section>

        <section id="editorCard" class="panel card editor-panel hidden" aria-labelledby="editorTitle">
          <div class="editor-topline">
            <div><h2 id="editorTitle" tabindex="-1">New routing rule</h2><p class="muted">Use the guided builder, or switch to JSON for the complete schema.</p></div>
            <div class="editor-controls">
              <button id="loadAuditSample" class="btn" type="button">Load from audit</button>
              <div class="form-field"><label for="template">Start from a template</label><select id="template" class="form-select"><option value="route">Route a sender domain</option><option value="drop">Drop an exact sender</option><option value="quarantine">Quarantine an attachment type</option></select></div>
              <button id="applyTemplate" class="btn" type="button">Apply</button>
            </div>
          </div>
          <div class="mode-switch" aria-label="Rule editor mode">
            <button id="builderMode" type="button" aria-pressed="true">Guided builder</button>
            <button id="jsonMode" type="button" aria-pressed="false">Advanced JSON</button>
          </div>
          <div id="generatedDraftBanner" class="draft-banner hidden" role="status">
            <span class="mode-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M8 5 3 12l5 7m8-14 5 7-5 7M14 4l-4 16"/></svg></span>
            <div><strong>Drafted from an audited email</strong><p>Review the match conditions, choose any required Gorelo records, teach the changing values, then save. The rule starts disabled.</p></div>
          </div>

          <form id="ruleForm">
            <section class="form-section" aria-labelledby="basicsHeading">
              <div class="section-heading"><span class="section-number" aria-hidden="true">1</span><div><h3 id="basicsHeading">Basics</h3><p>Name the policy and place it in evaluation order.</p></div></div>
              <div class="form-grid">
                <div class="form-field span-2"><label for="ruleName">Rule name</label><input id="ruleName" maxlength="120" required placeholder="e.g. Route Acme monitoring alerts"></div>
                <div class="form-field"><label for="rulePriority">Priority</label><input id="rulePriority" type="number" min="0" max="100000" step="1" required></div>
                <div class="form-field span-2"><label for="ruleDescription">Description</label><textarea id="ruleDescription" maxlength="500" placeholder="What this policy protects or routes"></textarea></div>
                <div class="form-field"><label for="ruleMatch">Condition logic</label><select id="ruleMatch"><option value="all">Match all conditions</option><option value="any">Match any condition</option></select></div>
                <div class="check-field"><input id="ruleEnabled" type="checkbox"><label for="ruleEnabled">Rule enabled</label></div>
              </div>
            </section>

            <section class="form-section" aria-labelledby="conditionsHeading">
              <div class="section-heading"><span class="section-number" aria-hidden="true">2</span><div><h3 id="conditionsHeading">Conditions</h3><p>Combine envelope, header, size, body, attachment, and score facts.</p></div></div>
              <div id="conditions" class="conditions"></div>
              <button id="addCondition" class="small add-condition" type="button">+ Add condition</button>
            </section>

            <section class="form-section" aria-labelledby="actionHeading">
              <div class="section-heading"><span class="section-number" aria-hidden="true">3</span><div><h3 id="actionHeading">Action</h3><p>Choose what happens when this rule is the first match.</p></div></div>
              <div class="form-grid">
                <div class="form-field"><label for="actionType">Action</label><select id="actionType"><option value="forward">Forward to Gorelo</option><option value="create_ticket">Create Gorelo ticket via API</option><option value="create_alert">Create Gorelo alert via API</option><option value="forward_webhook">Forward + signed webhook</option><option value="quarantine">Quarantine for review</option><option value="drop">Accept and discard</option><option value="reject">Reject at SMTP</option></select></div>
                <div id="actionMailboxGroup" class="form-field span-2"><label for="actionMailboxId">Gorelo mailbox</label><select id="actionMailboxId"><option value="">Default Gorelo mailbox</option></select><span class="field-help">Choose a named destination, or follow the persistent default mailbox.</span></div>
                <div id="quarantineDestinationGroup" class="form-field span-2 hidden"><label for="quarantineDestination">Quarantine destination override</label><input id="quarantineDestination" type="email" placeholder="Optional allow-listed review address"><span class="field-help">Leave blank to use the configured quarantine route.</span></div>
                <div id="rejectReasonGroup" class="form-field span-2 hidden"><label for="rejectReason">SMTP rejection reason</label><input id="rejectReason" maxlength="200" value="Message rejected by policy"></div>
                <div id="bypassSpamGroup" class="check-field span-2"><input id="bypassSpam" type="checkbox"><label id="bypassSpamLabel" for="bypassSpam">Bypass the global spam action when this forward rule matches</label></div>
              </div>
              <div id="webhookActionConfig" class="webhook-action-config hidden">
                <div class="webhook-action-grid">
                  <div class="webhook-destination-line">
                    <div class="form-field"><label for="ruleWebhookDestination">Registered webhook</label><select id="ruleWebhookDestination" disabled required><option value="">Select this action to load destinations</option></select></div>
                    <button id="refreshRuleWebhooks" class="btn small" type="button">Refresh</button>
                  </div>
                  <div class="form-field"><label for="webhookEventType">Event type</label><input id="webhookEventType" maxlength="128" required value="mail.parsed" placeholder="mail.parsed"><span class="field-help">Stable identifier sent in the signed webhook envelope.</span></div>
                  <p id="webhookActionAvailability" class="webhook-action-status" role="status">Select this action to load registered destinations.</p>
                </div>
              </div>
              <div id="mappedActionConfig" class="mapped-action-config hidden">
                <div class="extraction-heading">
                  <div><h4 id="extractionHeading">Extract mapped fields</h4><p id="extractionDescription">Give each value a safe key, choose its email source, and optionally isolate text between markers.</p></div>
                  <div class="extraction-actions">
                    <button id="teachParser" class="btn small teach-parser" type="button">Teach from sample</button>
                    <button id="addWebhookField" class="btn small" type="button">Add manually</button>
                  </div>
                </div>
                <div id="webhookFields" class="extraction-fields" aria-live="polite"></div>
                <div id="webhookClientLinkage" class="client-linkage">
                  <div class="form-field"><label for="clientIdentityField">Resolve this field as a Gorelo client</label><select id="clientIdentityField"><option value="">Do not resolve a client</option></select><span class="field-help">Email content is untrusted. Use dynamic mapping only with a dedicated parser address and independently authenticated source.</span></div>
                  <div id="clientAliasScopeGroup" class="form-field hidden"><label for="clientAliasScope">Alias scope</label><input id="clientAliasScope" maxlength="128" value="global" placeholder="global"><span class="field-help">Use global unless this parser needs vendor-specific aliases.</span></div>
                </div>
                <div id="goreloClientLinkage" class="client-linkage hidden">
                  <div class="form-field"><label for="goreloClientMode">Gorelo client</label><select id="goreloClientMode"><option value="fixed">Choose an imported client</option><option value="extracted">Resolve an extracted field</option></select><span class="field-help">Exactly one current client is required. Stale or ambiguous matches fail safely.</span></div>
                  <div id="goreloFixedClientGroup" class="form-field"><label for="goreloClientId">Imported client</label><select id="goreloClientId"><option value="">Load the client directory first</option></select></div>
                  <div id="goreloIdentityFieldGroup" class="form-field hidden"><label for="goreloClientIdentityField">Client identity field</label><select id="goreloClientIdentityField"><option value="">Add an extraction field first</option></select><span class="field-help">Matched exactly. Because email content is untrusted, use a dedicated parser address and independently authenticated source.</span></div>
                  <div id="goreloAliasScopeGroup" class="form-field hidden"><label for="goreloClientAliasScope">Alias scope</label><input id="goreloClientAliasScope" maxlength="128" value="global" placeholder="global"><span class="field-help">Use global unless aliases are intentionally vendor-specific.</span></div>
                </div>
              </div>
              <div id="goreloActionConfig" class="gorelo-action-config hidden">
                <div class="gorelo-action-heading">
                  <div><h4 id="goreloActionHeading">Gorelo API action</h4><p>Configure a structured API request from extracted values and current Gorelo catalogs.</p></div>
                  <button id="refreshGoreloCatalogs" class="btn small" type="button">Refresh catalogs</button>
                </div>
                <p id="goreloCatalogStatus" class="gorelo-catalog-status" role="status">Select a Gorelo API action to load clients and catalogs.</p>
                <div id="goreloVariableBar" class="gorelo-variable-bar">
                  <div class="gorelo-variable-copy"><strong>Use a learned variable</strong><span id="goreloVariableTarget" role="status" aria-live="polite">Learned variables are text until mapped to a template or assignment below.</span></div>
                  <div id="goreloVariableChips" class="gorelo-variable-chips" aria-label="Available learned variables"></div>
                </div>
                <div id="ticketActionFields" class="gorelo-action-grid hidden">
                  <div class="form-field wide"><label for="ticketTitleTemplate">Ticket title template</label><input id="ticketTitleTemplate" maxlength="998" placeholder="{{subject}}" required><span class="field-help">Use placeholders such as {{subject}} that exactly match extraction keys.</span></div>
                  <div class="form-field wide"><label for="ticketDescriptionTemplate">Description template</label><textarea id="ticketDescriptionTemplate" maxlength="16000" placeholder="Alert details: {{details}}"></textarea></div>
                  <div class="form-field"><label for="ticketCreatedByTemplate">Created by name template</label><input id="ticketCreatedByTemplate" maxlength="320" placeholder="Gorelo Router · {{vendor}}"></div>
                  <div class="form-field"><label for="ticketStatusId">Status</label><select id="ticketStatusId" required><option value="">Load statuses</option></select></div>
                  <div class="form-field"><label for="ticketGroupId">Group</label><select id="ticketGroupId" required><option value="">Load groups</option></select></div>
                  <div class="form-field"><label for="ticketTypeId">Ticket type</label><select id="ticketTypeId" required><option value="">Load ticket types</option></select></div>
                  <div class="form-field"><label for="ticketPriorityId">Priority</label><select id="ticketPriorityId"><option value="">Gorelo default</option><option value="0">Priority 0</option><option value="1">Priority 1</option><option value="2">Priority 2</option><option value="3">Priority 3</option><option value="4">Priority 4</option></select></div>
                  <div class="form-field"><label for="ticketSourceId">Source</label><select id="ticketSourceId"><option value="">Gorelo default</option><option value="1">Source 1</option><option value="2">Source 2</option><option value="3">Source 3</option><option value="4">Source 4</option><option value="5">Source 5</option><option value="6">Source 6</option></select></div>
                  <div class="form-field"><label for="ticketLocationId">Location</label><select id="ticketLocationId"><option value="">No location</option></select><span class="field-help">Choose one for a fixed client. Dynamically resolved contacts and devices can derive a shared location safely.</span></div>
                  <section class="gorelo-assignment-section wide" aria-labelledby="goreloAssignmentsHeading">
                    <div class="gorelo-assignment-heading"><h5 id="goreloAssignmentsHeading">Assignments &amp; associations</h5><p>Choose a fixed Gorelo record or resolve an extracted value exactly at delivery time. Learned fields remain plain text until mapped here.</p></div>
                    <div class="gorelo-assignment-grid">
                      <div class="gorelo-assignment-row" role="group" aria-labelledby="ticketContactAssignmentHeading">
                        <div class="gorelo-assignment-copy"><h6 id="ticketContactAssignmentHeading">Customer contact</h6><span class="field-help">Associates the requester with the ticket inside the resolved customer.</span></div>
                        <div class="form-field"><label for="ticketContactMode">Assignment</label><select id="ticketContactMode"><option value="none">None</option><option value="fixed">Fixed contact</option><option value="extracted">From extracted field</option></select></div>
                        <div id="ticketContactFixedGroup" class="form-field gorelo-assignment-fixed hidden"><label for="ticketContactId">Contact</label><select id="ticketContactId"><option value="">Select a contact</option></select><span class="field-help">Fixed contacts require a fixed client.</span></div>
                        <div id="ticketContactResolverGroup" class="gorelo-assignment-dynamic hidden">
                          <div class="form-field"><label for="ticketContactResolverField">Extraction field</label><select id="ticketContactResolverField" aria-describedby="ticketContactResolverHelp"><option value="">Add an extraction field first</option></select></div>
                          <div class="form-field"><label for="ticketContactResolverMatchBy">Match by</label><select id="ticketContactResolverMatchBy" aria-describedby="ticketContactResolverHelp"><option value="email">Email</option><option value="alias">Alias</option><option value="name">Name</option><option value="id">Gorelo ID</option></select></div>
                          <span id="ticketContactResolverHelp" class="field-help">Resolved after the customer is known. Dry run and live processing query only that customer’s contacts.</span>
                        </div>
                      </div>
                      <div class="gorelo-assignment-row" role="group" aria-labelledby="ticketAgentAssetAssignmentHeading">
                        <div class="gorelo-assignment-copy"><h6 id="ticketAgentAssetAssignmentHeading">Managed device</h6><span class="field-help">Associates one resolved device, or a fixed set of agent assets, with the ticket.</span></div>
                        <div class="form-field"><label for="ticketAgentAssetMode">Association</label><select id="ticketAgentAssetMode"><option value="none">None</option><option value="fixed">Fixed devices</option><option value="extracted">From extracted field</option></select></div>
                        <div id="ticketAgentAssetFixedGroup" class="form-field gorelo-assignment-fixed hidden"><label for="ticketAgentAssetIds">Agent assets</label><select id="ticketAgentAssetIds" multiple size="4"></select><span class="field-help">Fixed devices require a fixed client. Use Ctrl/Cmd to select more than one.</span></div>
                        <div id="ticketAgentAssetResolverGroup" class="gorelo-assignment-dynamic hidden">
                          <div class="form-field"><label for="ticketAgentAssetResolverField">Extraction field</label><select id="ticketAgentAssetResolverField"><option value="">Add an extraction field first</option></select></div>
                          <div class="form-field"><label for="ticketAgentAssetResolverMatchBy">Match by</label><select id="ticketAgentAssetResolverMatchBy"><option value="name">Exact device name</option><option value="serial_number">Serial number</option><option value="id">Gorelo ID</option></select></div>
                        </div>
                      </div>
                      <div class="gorelo-assignment-row" role="group" aria-labelledby="ticketLeadAssigneeAssignmentHeading">
                        <div class="gorelo-assignment-copy"><h6 id="ticketLeadAssigneeAssignmentHeading">Gorelo technician</h6><span class="field-help">Assigns the ticket to an internal Gorelo user, not the customer contact.</span></div>
                        <div class="form-field"><label for="ticketLeadAssigneeMode">Assignment</label><select id="ticketLeadAssigneeMode"><option value="none">None</option><option value="fixed">Fixed technician</option><option value="extracted">From extracted field</option></select></div>
                        <div id="ticketLeadAssigneeFixedGroup" class="form-field gorelo-assignment-fixed hidden"><label for="ticketLeadAssigneeId">Technician</label><select id="ticketLeadAssigneeId"><option value="">Select a technician</option></select></div>
                        <div id="ticketLeadAssigneeResolverGroup" class="gorelo-assignment-dynamic hidden">
                          <div class="form-field"><label for="ticketLeadAssigneeResolverField">Extraction field</label><select id="ticketLeadAssigneeResolverField"><option value="">Add an extraction field first</option></select></div>
                          <div class="form-field"><label for="ticketLeadAssigneeResolverMatchBy">Match by</label><select id="ticketLeadAssigneeResolverMatchBy"><option value="email">Email</option><option value="name">Name</option><option value="id">Gorelo ID</option></select></div>
                        </div>
                      </div>
                    </div>
                  </section>
                  <div class="form-field"><label for="ticketCcContactIds">CC contacts</label><select id="ticketCcContactIds" multiple size="4" aria-describedby="ticketCcHelp"></select><span id="ticketCcHelp" class="field-help">Use Ctrl/Cmd to select more than one.</span></div>
                  <div class="form-field"><label for="ticketAssistingIds">Assisting assignees</label><select id="ticketAssistingIds" multiple size="4"></select></div>
                  <div class="form-field"><label for="ticketWatcherIds">Watchers</label><select id="ticketWatcherIds" multiple size="4"></select></div>
                  <div class="form-field"><label for="ticketTagIds">Tags</label><select id="ticketTagIds" multiple size="4"></select></div>
                  <div class="gorelo-flags">
                    <div class="inline-check"><input id="ticketSendCreatedEmail" type="checkbox"><label for="ticketSendCreatedEmail">Send Gorelo ticket-created email</label></div>
                    <div class="inline-check"><input id="ticketIsUnread" type="checkbox" checked><label for="ticketIsUnread">Mark ticket unread</label></div>
                  </div>
                </div>
                <div id="alertActionFields" class="gorelo-action-grid hidden">
                  <div class="form-field wide"><label for="alertNameTemplate">Alert name template</label><input id="alertNameTemplate" maxlength="998" placeholder="{{subject}}" required></div>
                  <div class="form-field"><label for="alertResourceTemplate">Resource template</label><input id="alertResourceTemplate" maxlength="998" placeholder="{{asset}}" required></div>
                  <div class="form-field"><label for="alertSeverity">Severity</label><select id="alertSeverity" required><option value="1">Severity 1</option><option value="2">Severity 2</option><option value="3" selected>Severity 3</option><option value="4">Severity 4</option></select></div>
                  <div class="form-field wide"><label for="alertDescriptionTemplate">Description template</label><textarea id="alertDescriptionTemplate" maxlength="16000" placeholder="{{details}}"></textarea></div>
                </div>
                <p class="gorelo-template-help">API-only action: the original message is not forwarded. Gorelo receives only the mapped fields above. Saving or dry-running a rule never creates a ticket or alert.</p>
              </div>
              <p id="actionNote" class="action-note">Forwarding preserves the original MIME message and respects the configured spam action.</p>
            </section>
          </form>

          <div id="jsonEditor" class="hidden">
            <div class="form-field"><label for="ruleJson">Complete rule JSON</label><textarea id="ruleJson" class="code" spellcheck="false" aria-describedby="jsonHelp"></textarea><span id="jsonHelp" class="field-help">Use a registered <code>mailboxId</code> for forward actions. Legacy destination addresses remain supported for existing rules.</span></div>
          </div>
          <p id="editorError" class="error" role="alert" aria-live="assertive"></p>
          <div class="editor-footer">
            <p>Changes take effect on the next inbound message.</p>
            <div class="editor-actions"><button id="cancelEdit" class="btn" type="button">Cancel</button><button id="saveRule" class="btn btn-primary primary" type="button">Save rule</button></div>
          </div>
        </section>
      </div>

      <div id="quarantineTab" class="hidden" role="tabpanel" aria-labelledby="quarantineTabButton">
        <section class="panel card" aria-labelledby="quarantineHeading">
          <div class="panel-header"><div><h2 id="quarantineHeading" tabindex="-1">Quarantine review</h2><p>Review held messages, understand the policy decision, and record a disposition.</p></div></div>
          <div id="quarantineMode" class="mode-banner" role="status"></div>
          <section class="quarantine-metrics" aria-label="Quarantine summary">
            <div class="mini-stat"><strong id="quarantinePending">0</strong><span>Needs review</span></div>
            <div class="mini-stat"><strong id="quarantineFailed">0</strong><span>Release failed</span></div>
            <div class="mini-stat"><strong id="quarantineReleased">0</strong><span>Released</span></div>
            <div class="mini-stat"><strong id="quarantineDismissed">0</strong><span>Dismissed</span></div>
          </section>
          <div class="filter-bar">
            <div class="form-field"><label for="quarantineSearch">Search held mail</label><input id="quarantineSearch" class="form-control" type="search" maxlength="200" placeholder="Subject, sender, recipient, reason…"></div>
            <div class="form-field"><label for="quarantineState">Review state</label><select id="quarantineState" class="form-select"><option value="all">All states</option><option value="pending">Needs review</option><option value="release_failed">Release failed</option><option value="releasing">Release in progress / uncertain</option><option value="released">Released</option><option value="dismissed">Dismissed</option><option value="expired">Expired</option></select></div>
            <button id="refreshQuarantine" class="btn refresh-quarantine" type="button">Refresh queue</button>
          </div>
          <p id="quarantineNotice" class="error" role="alert" aria-live="assertive"></p>
          <div class="quarantine-layout">
            <div class="queue-column"><div id="quarantineList" class="queue-list" role="list" aria-label="Quarantined messages" aria-live="polite"></div><button id="loadMoreQuarantine" class="btn pagination-control hidden" type="button">Load older messages</button></div>
            <section id="quarantineDetail" class="review-pane" aria-label="Selected quarantined message" aria-live="polite">
              <div class="review-pane-empty"><div class="empty-icon" aria-hidden="true">Q</div><h3>Select a message</h3><p>Choose a held message to review its decision, content availability, and audit trail.</p></div>
            </section>
          </div>
        </section>
      </div>

      <div id="auditTab" class="hidden" role="tabpanel" aria-labelledby="auditTabButton">
        <section class="panel card" aria-labelledby="auditHeading">
          <div class="panel-header"><div><h2 id="auditHeading" tabindex="-1">Message audit</h2><p>Operational evidence for retained routing decisions. Email-forward statuses mean Cloudflare accepted the action, not final mailbox delivery.</p></div></div>
          <div id="captureBanner" class="capture-banner hidden" role="status" aria-live="polite"></div>
          <div id="auditTypeTabs" class="mode-switch audit-type-tabs" role="tablist" aria-label="Audit message type"><button id="auditEmailsTab" type="button" role="tab" aria-selected="true">Emails <span id="auditEmailCount">0</span></button><button id="auditWebhooksTab" type="button" role="tab" aria-selected="false">Webhooks <span id="auditWebhookCount">0</span></button></div>
          <div class="filter-bar">
            <div class="form-field"><label for="eventSearch">Search messages</label><input id="eventSearch" class="form-control" type="search" maxlength="200" placeholder="Subject, sender, recipient, rule…"></div>
            <div class="form-field"><label for="eventStatus">Status</label><select id="eventStatus" class="form-select"><option value="all">All statuses</option><option value="forwarded">Completed / email forwarded</option><option value="quarantined">Quarantined</option><option value="dropped">Dropped</option><option value="rejected">Rejected</option><option value="failed">Failed / needs review</option></select></div>
            <button id="refreshEvents" class="btn refresh-events" type="button">Refresh audit</button>
          </div>
          <p id="eventsNotice" class="error" role="alert" aria-live="assertive"></p>
          <div id="events" class="event-list" aria-live="polite"></div>
          <button id="loadMoreEvents" class="btn pagination-control hidden" type="button">Load older messages</button>
        </section>
      </div>

      <div id="testTab" class="hidden" role="tabpanel" aria-labelledby="testTabButton">
        <section class="panel card" aria-labelledby="testHeading">
          <div class="panel-header"><div><h2 id="testHeading" tabindex="-1">Dry-run a message</h2><p>Evaluate the current policy without sending or storing anything.</p></div></div>
          <div class="test-layout">
            <form id="testForm">
              <div class="test-form-grid">
                <div class="form-field"><label for="testFrom">Envelope sender</label><input id="testFrom" type="email" required></div>
                <div class="form-field"><label for="testTo">Envelope recipient</label><input id="testTo" type="email" required></div>
                <div class="form-field span-2"><label for="testSubject">Subject</label><input id="testSubject" maxlength="998"></div>
                <div class="form-field span-2"><label for="testBody">Body text</label><textarea id="testBody" maxlength="1000000"></textarea></div>
                <div class="form-field"><label for="testAttachments">Attachment filenames</label><input id="testAttachments" placeholder="report.pdf, alert.txt"><span class="field-help">Comma-separated names.</span></div>
                <div class="form-field"><label for="testRawSize">Raw message size</label><input id="testRawSize" type="number" min="0" max="26214400" step="1"></div>
                <div class="form-field span-2"><label for="testHeaders">Headers JSON</label><textarea id="testHeaders" class="form-control code" spellcheck="false"></textarea></div>
              </div>
              <p id="testError" class="error" role="alert" aria-live="assertive"></p>
              <button id="runTest" class="btn btn-primary primary" type="submit">Evaluate policy</button>
            </form>
            <p id="testResultStatus" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>
            <aside id="testResult" class="test-result is-empty" aria-busy="false" aria-describedby="testError">
              <div class="result-empty"><div class="result-orb" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"></path></svg></div><h3>No result yet</h3><p>Complete the message facts and evaluate to see the exact routing decision.</p></div>
            </aside>
          </div>
        </section>
      </div>

      <div id="setupTab" class="hidden" role="tabpanel" aria-labelledby="setupTabButton">
        <section class="panel card" aria-labelledby="setupHeading">
          <div class="panel-header">
            <div><h2 id="setupHeading" tabindex="-1">Setup readiness</h2><p>Verify the Worker and Gorelo integration without exposing credentials in this browser.</p></div>
            <div class="toolbar"><button id="refreshSetup" class="btn" type="button">Refresh setup</button><button id="testGorelo" class="btn btn-primary primary" type="button">Test connection</button></div>
          </div>
          <p id="setupNotice" class="error" role="alert" aria-live="assertive"></p>
          <div id="setupContent" aria-live="polite">
            <div class="setup-hero">
              <div class="setup-hero-copy"><div id="setupReadyIcon" class="setup-orb" aria-hidden="true"></div><div><h3 id="setupReadyTitle">Loading setup status</h3><p id="setupReadyDetail">Checking required Worker bindings and integrations.</p></div></div>
              <div class="setup-profile"><span class="detail-label">Active profile</span><strong id="setupProfile">—</strong></div>
            </div>
            <div class="setup-grid">
              <section class="setup-card" aria-labelledby="setupChecklistHeading">
                <div class="setup-card-heading"><div><h3 id="setupChecklistHeading">Readiness checklist</h3><p>Required and optional deployment checks reported by the Worker.</p></div></div>
                <div id="setupChecks" class="setup-checks" aria-busy="true"></div>
              </section>
              <section class="setup-card" aria-labelledby="emailIngressHeading">
                <div class="setup-card-heading"><div><h3 id="emailIngressHeading">Inbound email domains</h3><p>Every domain has its own Cloudflare catch-all; all messages enter this shared rules and audit engine.</p></div><span id="emailIngressCount" class="setup-state optional">Checking</span></div>
                <div id="emailIngressDomains" class="compact-list" aria-live="polite"></div>
                <p class="field-help">Rules can match <strong>Recipient domain</strong> when domains need different routing behavior.</p>
              </section>
              <section class="setup-card" aria-labelledby="goreloSetupHeading">
                <div class="setup-card-heading"><div><h3 id="goreloSetupHeading">Gorelo integration</h3><p>Connection metadata only. Secrets remain in Cloudflare.</p></div><span id="goreloConfiguredBadge" class="setup-state">Checking</span></div>
                <div class="integration-details">
                  <div class="integration-detail"><span class="detail-label">Region</span><strong id="goreloRegion">—</strong></div>
                  <div class="integration-detail"><span class="detail-label">Secret binding</span><strong id="goreloSecretName">—</strong></div>
                  <div class="integration-detail wide"><span class="detail-label">API endpoint</span><strong id="goreloEndpoint">—</strong></div>
                </div>
                <span class="field-label">Set the secret from your terminal</span>
                <div class="command-block"><code id="setupCommand">Loading secure setup command…</code><button id="copySetupCommand" class="btn small" type="button">Copy command</button></div>
                <p class="setup-secret-note">The command prompts securely in your terminal. This page never asks for, stores, or returns the API key.</p>
                <div id="goreloTestResult" class="catalog-summary hidden" role="status">
                  <div class="catalog-heading"><div><strong>Connection verified</strong><p id="goreloCheckedAt">—</p></div><span class="setup-state ready">Connected</span></div>
                  <p id="goreloTestEndpoint" class="field-help"></p>
                  <div id="goreloCatalogCounts" class="catalog-counts"></div>
                </div>
              </section>
            </div>
            <div class="setup-extensions">
              <section class="setup-card mailbox-card" aria-labelledby="goreloMailboxesHeading">
                <div class="setup-card-heading compact-card-heading">
                  <div><h3 id="goreloMailboxesHeading">Gorelo mailboxes</h3><p>Name every Gorelo email destination once, choose a default, then route rules by mailbox instead of typing addresses.</p></div>
                  <div class="toolbar"><button id="addMailbox" class="btn small" type="button" disabled>+ Mailbox</button></div>
                </div>
                <p class="setup-secret-note">The default mailbox domain is allowed automatically. Add other exact domains to <code>ALLOWED_FORWARD_DOMAINS</code>; use <code>ALLOWED_FORWARD_DESTINATIONS</code> only for individual address exceptions. Cloudflare must verify every destination before delivery. Addresses stay fixed after creation so saved rules cannot silently redirect.</p>
                <p id="mailboxNotice" class="error" role="alert" aria-live="assertive"></p>
                <div id="mailboxList" class="mailbox-list" aria-live="polite"></div>
                <form id="mailboxForm" class="mailbox-form hidden" aria-labelledby="mailboxFormHeading">
                  <div class="mailbox-form-heading"><div><h4 id="mailboxFormHeading">Add Gorelo mailbox</h4><p id="mailboxFormDescription">Register a verified address on an allowed domain.</p></div><span id="mailboxFormMode" class="setup-state optional">New</span></div>
                  <div class="form-field"><label for="mailboxName">Mailbox name</label><input id="mailboxName" maxlength="120" autocomplete="off" required placeholder="Service desk"></div>
                  <div class="form-field"><label for="mailboxAddress">Gorelo email address</label><input id="mailboxAddress" type="email" maxlength="254" autocomplete="off" required placeholder="tickets@example.gorelo.com"><span class="field-help">Use the default mailbox domain, a domain in <code>ALLOWED_FORWARD_DOMAINS</code>, or an exact address exception.</span></div>
                  <div class="inline-check"><input id="mailboxEnabled" type="checkbox" checked><label for="mailboxEnabled">Enable this mailbox for routing</label></div>
                  <p id="mailboxFormError" class="error" role="alert" aria-live="assertive"></p>
                  <div class="form-actions"><button id="cancelMailbox" class="btn small" type="button">Cancel</button><button id="saveMailbox" class="btn btn-primary primary small" type="submit">Save mailbox</button></div>
                </form>
              </section>

              <section class="setup-card mailbox-card" aria-labelledby="inboundWebhookSourcesHeading">
                <div class="setup-card-heading compact-card-heading">
                  <div><h3 id="inboundWebhookSourcesHeading">Inbound webhook sources</h3><p>Give each sending system a private endpoint and token, map only the JSON values you need, then route them to Gorelo or a signed destination.</p></div>
                  <div class="toolbar"><button id="addInboundWebhookSource" class="btn small" type="button">+ Source</button></div>
                </div>
                <p id="inboundWebhookSourceNotice" class="error" role="alert" aria-live="assertive"></p>
                <div id="inboundWebhookToken" class="source-token hidden" role="status" aria-live="polite">
                  <div><strong id="inboundWebhookTokenTitle">Save this source token now</strong><span id="inboundWebhookTokenContext">It is shown once. Gorelo Router stores only its SHA-256 digest.</span></div>
                  <code id="inboundWebhookTokenValue"></code>
                  <button id="copyInboundWebhookToken" class="btn small" type="button">Copy token</button>
                </div>
                <div id="inboundWebhookSourceList" class="compact-list source-list" aria-live="polite"></div>
                <form id="inboundWebhookSourceForm" class="source-form hidden" aria-labelledby="inboundWebhookSourceFormHeading">
                  <div class="source-form-heading"><div><h4 id="inboundWebhookSourceFormHeading">Add webhook source</h4><p>The endpoint accepts JSON POST requests authenticated by bearer token.</p></div><span id="inboundWebhookSourceFormMode" class="setup-state optional">New</span></div>
                  <div class="form-field"><label for="inboundWebhookSourceName">Source name</label><input id="inboundWebhookSourceName" maxlength="120" required autocomplete="off" placeholder="Monitoring platform"></div>
                  <div class="form-field"><label for="inboundWebhookSourceSlug">Endpoint path</label><div class="input-prefix"><span>/hooks/v1/</span><input id="inboundWebhookSourceSlug" maxlength="64" required autocomplete="off" spellcheck="false" placeholder="monitoring-platform"></div></div>
                  <div class="form-field"><label for="inboundWebhookSourceAction">Route action</label><select id="inboundWebhookSourceAction"><option value="accept">Audit only</option><option value="send_webhook">Send signed webhook</option><option value="gorelo_rule">Create in Gorelo from rule action</option></select></div>
                  <div class="form-field"><label for="inboundWebhookRateLimit">Requests per minute</label><input id="inboundWebhookRateLimit" type="number" min="1" max="1000" step="1" value="60" required></div>
                  <div id="inboundWebhookDestinationGroup" class="form-field hidden"><label for="inboundWebhookDestination">Outbound destination</label><select id="inboundWebhookDestination"><option value="">Select a registered destination</option></select></div>
                  <div id="inboundWebhookRuleGroup" class="form-field hidden"><label for="inboundWebhookRule">Gorelo action template</label><select id="inboundWebhookRule"><option value="">Select a ticket or alert rule</option></select><span class="field-help">Only the rule's Gorelo action and templates are reused; its email conditions and enabled state are ignored.</span></div>
                  <div id="inboundWebhookEventTypeGroup" class="form-field hidden"><label for="inboundWebhookEventType">Outbound event type</label><input id="inboundWebhookEventType" maxlength="128" value="webhook.routed" spellcheck="false"></div>
                  <div class="form-field source-mappings"><label for="inboundWebhookMappings">JSON Pointer mappings</label><textarea id="inboundWebhookMappings" rows="5" required spellcheck="false" placeholder="customer! = /client/name&#10;device = /asset/hostname&#10;details = /message"></textarea><span class="field-help">One <code>variable = /json/pointer</code> per line. Add <code>!</code> after the variable to reject requests when it is missing.</span></div>
                  <div class="inline-check"><input id="inboundWebhookSourceEnabled" type="checkbox" checked><label for="inboundWebhookSourceEnabled">Accept requests from this source</label></div>
                  <p id="inboundWebhookSourceFormError" class="error" role="alert" aria-live="assertive"></p>
                  <div class="form-actions"><button id="cancelInboundWebhookSource" class="btn small" type="button">Cancel</button><button id="saveInboundWebhookSource" class="btn btn-primary primary small" type="submit">Create source</button></div>
                </form>
              </section>

              <section class="setup-card" aria-labelledby="clientDirectoryHeading">
                <div class="setup-card-heading compact-card-heading">
                  <div><h3 id="clientDirectoryHeading">Client directory</h3><p>Import Gorelo clients, then assign every exact source name used for each customer.</p></div>
                  <div class="toolbar"><button id="importGoreloClients" class="btn small" type="button">Import from Gorelo</button></div>
                </div>
                <div class="directory-toolbar">
                  <div class="form-field"><label for="clientSearch">Search clients or aliases</label><input id="clientSearch" type="search" maxlength="160" autocomplete="off" placeholder="Name, domain, alias, or client ID"></div>
                  <p id="clientImportStatus" class="directory-status" role="status">Open Setup to load clients.</p>
                </div>
                <p id="clientDirectoryNotice" class="error" role="alert" aria-live="assertive"></p>
                <div id="clientDirectory" class="compact-list client-directory-list" aria-live="polite"></div>
                <form id="clientAliasForm" class="inline-setup-form">
                  <div class="form-field"><label for="aliasClientId">Gorelo client</label><select id="aliasClientId" required disabled><option value="">Import clients first</option></select></div>
                  <div class="form-field"><label for="aliasScope">Scope</label><input id="aliasScope" maxlength="128" autocomplete="off" required value="global" placeholder="global"><span class="field-help">Use global or a source such as vendor-a.</span></div>
                  <div class="form-field alias-values-field"><label for="clientAliases">Customer aliases</label><textarea id="clientAliases" rows="4" maxlength="51299" autocomplete="off" required placeholder="ACME AU&#10;Acme North&#10;Tenant 0042"></textarea><span class="field-help">One literal alias per line, up to 100. All entries are saved together or none are.</span></div>
                  <div class="form-actions"><button id="addClientAlias" class="btn btn-primary primary small" type="submit" disabled>Add aliases</button></div>
                </form>
                <form id="clientResolutionForm" class="alias-resolution-form">
                  <div class="form-field"><label for="clientResolutionIdentity">Preview exact resolution</label><input id="clientResolutionIdentity" maxlength="512" autocomplete="off" required placeholder="Paste a customer value from an email"><span class="field-help">Checks aliases and current Gorelo fields without fuzzy matching.</span></div>
                  <div class="form-field"><label for="clientResolutionScope">Scope</label><input id="clientResolutionScope" maxlength="128" autocomplete="off" required value="global" placeholder="global"></div>
                  <div class="form-actions"><button id="previewClientResolution" class="btn small" type="submit">Preview match</button></div>
                  <p id="clientResolutionResult" class="resolution-result" role="status" aria-live="polite">Enter a source value to verify the customer it resolves to.</p>
                </form>
              </section>

              <section class="setup-card" aria-labelledby="webhookDestinationsHeading">
                <div class="setup-card-heading compact-card-heading">
                  <div><h3 id="webhookDestinationsHeading">Webhook destinations</h3><p>Register HTTPS endpoints for parser actions. Saving never sends a request.</p></div>
                  <div class="toolbar"><button id="addWebhook" class="btn small" type="button" disabled>+ Destination</button></div>
                </div>
                <div id="webhookPosture" class="webhook-posture" aria-live="polite">
                  <div class="posture-item"><span class="detail-label">Registration</span><strong>Not loaded</strong></div>
                  <div class="posture-item"><span class="detail-label">Signing</span><strong>Not loaded</strong></div>
                  <div class="posture-item allowed-hosts"><span class="detail-label">Allowed hosts</span><strong>Not loaded</strong></div>
                </div>
                <p class="setup-secret-note">Signing keys stay in Cloudflare secrets. This page never accepts or displays them.</p>
                <p id="webhookNotice" class="error" role="alert" aria-live="assertive"></p>
                <div id="webhookList" class="compact-list webhook-list" aria-live="polite"></div>
                <form id="webhookForm" class="webhook-form hidden" aria-labelledby="webhookFormHeading">
                  <div class="webhook-form-heading"><div><h4 id="webhookFormHeading">Add destination</h4><p>Registration only—no test delivery will be sent.</p></div><span id="webhookFormMode" class="setup-state optional">New</span></div>
                  <div class="webhook-form-grid">
                    <div class="form-field"><label for="webhookName">Destination name</label><input id="webhookName" maxlength="120" autocomplete="off" required placeholder="Automation intake"></div>
                    <div class="form-field"><label for="webhookUrl">HTTPS URL</label><input id="webhookUrl" type="url" maxlength="2048" autocomplete="off" inputmode="url" required placeholder="https://hooks.example.net/mail"><span class="field-help">The host must be allowed by the server configuration.</span></div>
                  </div>
                  <div class="inline-check"><input id="webhookEnabled" type="checkbox" checked><label for="webhookEnabled">Enable this destination</label></div>
                  <p id="webhookFormError" class="error" role="alert" aria-live="assertive"></p>
                  <div class="webhook-form-actions"><button id="cancelWebhook" class="btn small" type="button">Cancel</button><button id="saveWebhook" class="btn btn-primary primary small" type="submit">Save destination</button></div>
                </form>
              </section>
            </div>
          </div>
        </section>
      </div>

    </section>
  </main>
  <dialog id="reviewDialog" class="review-dialog" aria-labelledby="reviewDialogTitle" aria-describedby="reviewDialogDescription">
    <form id="reviewActionForm">
      <div class="dialog-header">
        <h2 id="reviewDialogTitle">Review message</h2>
        <p id="reviewDialogDescription"></p>
      </div>
      <div class="dialog-body">
        <div id="reviewMailboxGroup" class="form-field"><label for="reviewMailboxId">Release to Gorelo mailbox</label><select id="reviewMailboxId" class="form-select" required><option value="">Select a mailbox</option></select><span class="field-help">Only enabled mailboxes permitted by the destination policy can receive a released message.</span></div>
        <div class="form-field"><label for="reviewNote">Review note</label><textarea id="reviewNote" class="form-control" maxlength="500" placeholder="Optional reason or handoff note"></textarea></div>
        <p id="reviewDialogError" class="error" role="alert" aria-live="assertive"></p>
      </div>
      <div class="dialog-footer">
        <button id="reviewCancel" class="btn" type="button">Cancel</button>
        <button id="reviewConfirm" class="btn btn-primary primary" type="submit">Confirm</button>
      </div>
    </form>
  </dialog>
  <dialog id="parserRuleDialog" class="review-dialog parser-rule-dialog" aria-labelledby="parserRuleDialogTitle" aria-describedby="parserRuleDialogDescription">
    <form id="parserRuleForm">
      <div class="dialog-header">
        <h2 id="parserRuleDialogTitle">Create a parser rule</h2>
        <p id="parserRuleDialogDescription">Start with this audited email, then teach the values that change from message to message.</p>
      </div>
      <div class="dialog-body">
        <div id="parserSampleSummary" class="parser-sample-summary" aria-live="polite"></div>
        <p id="parserBodyStatus" class="parser-body-status"></p>
        <div id="parserCaptureActions" class="parser-capture-actions hidden">
          <div class="parser-capture-config">
            <p id="parserCaptureHelp">The retained audit has no message body. Arm a short-lived capture for the next matching email.</p>
            <div class="parser-capture-options">
              <div class="form-field"><label for="captureSenderMode">Sender match</label><select id="captureSenderMode"><option value="address">Exact sender address</option><option value="domain">Same sender domain</option><option value="any">Any sender</option></select></div>
              <div class="form-field"><label for="captureSubjectContains">Subject must contain</label><input id="captureSubjectContains" maxlength="200" autocomplete="off" placeholder="Optional exact text"></div>
            </div>
            <p class="field-help">Only messages Cloudflare marks forwardable and this policy classifies as non-spam can be captured. Sender matching narrows the window; it does not replace SPF, DKIM, or DMARC.</p>
          </div>
          <button id="captureNextEmail" class="btn small" type="button">Capture next matching email</button>
        </div>
        <fieldset class="outcome-fieldset">
          <legend>What should matching emails do?</legend>
          <div class="outcome-options">
            <label class="outcome-card"><input type="radio" name="parserOutcome" value="forward" checked><span><strong>Forward email</strong><span>Send the original email to a named Gorelo mailbox.</span></span></label>
            <label class="outcome-card"><input type="radio" name="parserOutcome" value="forward_webhook"><span><strong>Forward + webhook</strong><span>Forward the original and send selected values as signed JSON.</span></span></label>
            <label class="outcome-card"><input type="radio" name="parserOutcome" value="create_ticket"><span><strong>Create ticket via API</strong><span>Build a structured Gorelo ticket from selected values.</span></span></label>
            <label class="outcome-card"><input type="radio" name="parserOutcome" value="create_alert"><span><strong>Create alert via API</strong><span>Build a structured Gorelo alert associated with a client or asset.</span></span></label>
          </div>
        </fieldset>
        <div id="parserMailboxGroup" class="form-field parser-route-field">
          <label for="parserMailboxId">Gorelo mailbox</label>
          <select id="parserMailboxId"><option value="">Follow the default Gorelo mailbox</option></select>
          <span class="field-help">Following the default keeps this rule attached to whichever mailbox is marked default later. Choosing a named mailbox pins the rule to it.</span>
        </div>
        <p id="parserRuleError" class="error" role="alert" aria-live="assertive"></p>
      </div>
      <div class="dialog-footer">
        <button id="cancelParserRule" class="btn" type="button">Cancel</button>
        <button id="continueParserRule" class="btn btn-primary primary" type="submit">Create disabled draft</button>
      </div>
    </form>
  </dialog>
  <dialog id="clientAliasDialog" class="review-dialog" aria-labelledby="clientAliasDialogTitle" aria-describedby="clientAliasDialogDescription">
    <form id="clientAliasEditForm">
      <div class="dialog-header">
        <h2 id="clientAliasDialogTitle">Edit customer alias</h2>
        <p id="clientAliasDialogDescription">Update the exact source value or its parser scope.</p>
      </div>
      <div class="dialog-body">
        <div class="form-field"><label for="editClientAlias">Customer alias</label><input id="editClientAlias" maxlength="512" autocomplete="off" required><span class="field-help">Matching is Unicode-normalized and case-insensitive, but never fuzzy.</span></div>
        <div class="form-field"><label for="editAliasScope">Scope</label><input id="editAliasScope" maxlength="128" autocomplete="off" required><span class="field-help">Use global or the exact source identifier configured on the parser rule.</span></div>
        <p id="clientAliasDialogError" class="error" role="alert" aria-live="assertive"></p>
      </div>
      <div class="dialog-footer">
        <button id="cancelClientAliasEdit" class="btn" type="button">Cancel</button>
        <button id="saveClientAliasEdit" class="btn btn-primary primary" type="submit">Save alias</button>
      </div>
    </form>
  </dialog>
  <dialog id="templateTrainerDialog" class="review-dialog trainer-dialog" aria-labelledby="templateTrainerTitle" aria-describedby="templateTrainerDescription">
    <div class="trainer-shell">
      <div class="dialog-header">
        <div>
          <h2 id="templateTrainerTitle">Teach the parser from an email</h2>
          <p id="templateTrainerDescription">Paste one representative message, highlight the value that changes, then give it a reusable name.</p>
        </div>
        <button id="closeTemplateTrainer" class="trainer-close" type="button" aria-label="Close parser trainer"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="trainer-body">
        <section class="trainer-sample-panel" aria-labelledby="trainerSampleHeading">
          <div class="trainer-panel-heading">
            <div><h3 id="trainerSampleHeading">Sample email</h3><p>Select text in any field below. The blue browser selection is the value the parser will learn.</p></div>
            <button id="useDryRunSample" class="btn small" type="button">Use Dry-run sample</button>
          </div>
          <p id="trainerPrivacy" class="trainer-privacy">This sample is used only for the current preview. It is never saved with the rule or sent to Gorelo or a webhook.</p>
          <div class="trainer-addresses">
            <div class="form-field"><label for="trainerFrom">From</label><input id="trainerFrom" data-trainer-source="from" maxlength="320" autocomplete="off" spellcheck="false" placeholder="alerts@vendor.example"></div>
            <div class="form-field"><label for="trainerTo">To</label><input id="trainerTo" data-trainer-source="to" maxlength="320" autocomplete="off" spellcheck="false" placeholder="support@example.net"></div>
          </div>
          <div class="form-field"><label for="trainerSubject">Subject</label><input id="trainerSubject" data-trainer-source="subject" maxlength="998" autocomplete="off" placeholder="Alert for ACME AU"></div>
          <div class="form-field"><label for="trainerBody">Plain-text body</label><textarea id="trainerBody" class="trainer-body-input" data-trainer-source="body_text" maxlength="50000" autocomplete="off" spellcheck="false" placeholder="Customer: ACME AU&#10;Device: SERVER-01&#10;Status: Offline"></textarea><span class="field-help">Use the normalized plain-text content Cloudflare delivers. HTML is never rendered here.</span></div>
          <div id="trainerSelectionState" class="trainer-selection-state" role="status" aria-live="polite">
            <span class="trainer-selection-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M8 5 3 12l5 7m8-14 5 7-5 7M14 4l-4 16"/></svg></span>
            <div><strong>No value selected</strong><span>Highlight a changing value in From, To, Subject, or Body.</span></div>
          </div>
        </section>
        <aside class="trainer-inspector" aria-label="Template builder">
          <section class="trainer-step" aria-labelledby="trainerVariableHeading">
            <h3 id="trainerVariableHeading">Name the selected value</h3>
            <p>Use a stable key such as customer, asset, severity, or alert_id.</p>
            <div class="trainer-create-line">
              <div class="form-field"><label for="trainerKey">Variable name</label><input id="trainerKey" maxlength="64" pattern="[A-Za-z_][A-Za-z0-9_]*" autocomplete="off" spellcheck="false" placeholder="customer"></div>
              <button id="createTrainerVariable" class="btn btn-primary primary" type="button" disabled>Create variable</button>
            </div>
            <p id="trainerError" class="error" role="alert" aria-live="assertive"></p>
          </section>
          <section class="trainer-step" aria-labelledby="trainerPreviewHeading">
            <h3 id="trainerPreviewHeading">Learned template</h3>
            <p>Selected values become tokens you can use in Gorelo templates; webhook actions send them as named JSON fields.</p>
            <div id="trainerTemplatePreview" class="trainer-template"><span class="trainer-template-empty">Add a sample and create a variable to see the reusable template.</span></div>
          </section>
          <section class="trainer-step" aria-labelledby="trainerCapturedHeading">
            <h3 id="trainerCapturedHeading">Variables ready to apply</h3>
            <p id="trainerCaptureSummary" role="status" aria-live="polite">No variables taught yet.</p>
            <ul id="trainerCaptures" class="trainer-captures"></ul>
          </section>
        </aside>
      </div>
      <div class="dialog-footer">
        <p class="trainer-footer-note">Only inferred markers and variable names are added to the rule.</p>
        <div class="trainer-footer-actions">
          <button id="cancelTemplateTrainer" class="btn" type="button">Cancel</button>
          <button id="applyTrainerVariables" class="btn btn-primary primary" type="button" disabled>Apply variables</button>
        </div>
      </div>
    </div>
  </dialog>
  <dialog id="commandDialog" class="command-dialog" aria-labelledby="commandDialogTitle">
    <div class="command-shell">
      <form id="commandForm" class="command-search" role="search">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
        <label id="commandDialogTitle" class="visually-hidden" for="commandSearch">Find a page or action</label>
        <input id="commandSearch" type="search" autocomplete="off" spellcheck="false" aria-controls="commandList" aria-describedby="commandHelp" placeholder="Find a page or action…">
        <button id="commandClose" class="command-close" type="button" aria-label="Close command menu"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </form>
      <div id="commandResults">
        <p id="commandHelp" class="visually-hidden">Type to filter commands. Use the up and down arrow keys to move, then Enter to run the selected command.</p>
        <ul id="commandList" class="command-list" aria-live="polite"></ul>
      </div>
      <div class="command-footer" aria-hidden="true">
        <span>Safe shortcuts never release, delete, import, or send.</span>
        <span class="command-hints"><span><kbd>↑↓</kbd> Move</span><span><kbd>Enter</kbd> Run</span><span><kbd>Esc</kbd> Close</span></span>
      </div>
    </div>
  </dialog>
  <div id="toastRegion" class="toast-region" aria-live="polite"></div>

  <script nonce="__CSP_NONCE__">
    let token = "";
    let testRequestVersion = 0;
    let editingId = null;
    let rulesCache = [];
    let eventsCache = [];
    let eventsCursor = null;
    let eventsRequestVersion = 0;
    let auditStream = "emails";
    let eventSearchTimer = null;
    let quarantineCache = [];
    let quarantineCursor = null;
    let quarantineRequestVersion = 0;
    let quarantineSearchTimer = null;
    let quarantineSummary = {pending:0,releaseFailed:0,released:0,dismissed:0};
    const RETAINED_MESSAGE_PAGE_SIZE = 50;
    let runtimeConfig = null;
    let setupState = null;
    let goreloTestState = null;
    let goreloClients = [];
    let goreloClientsTotal = 0;
    let goreloClientsImportedAt = null;
    let clientDirectoryLoaded = false;
    let clientDirectoryLoading = false;
    let editingClientAlias = null;
    const CLIENT_DIRECTORY_PAGE_SIZE = 500;
    const CLIENT_DIRECTORY_MAX_CLIENTS = 5000;
    const CLIENT_DIRECTORY_RENDER_LIMIT = 100;
    let goreloMailboxes = [];
    let goreloMailboxDefaultId = null;
    let goreloMailboxSettingsVersion = null;
    let goreloMailboxesLoaded = false;
    let goreloMailboxesLoading = false;
    let editingMailboxId = null;
    let webhooks = [];
    let webhookCapability = null;
    let webhooksLoaded = false;
    let webhooksLoading = false;
    let editingWebhookId = null;
    let inboundWebhookSources = [];
    let inboundWebhookSourcesLoaded = false;
    let inboundWebhookSourcesLoading = false;
    let inboundWebhookSourceInvoker = null;
    let editingInboundWebhookSourceId = null;
    let activeRequests = 0;
    let commandInvoker = null;
    let commandRestoreFocus = true;
    let commandSelection = 0;
    let visibleCommands = [];
    let activeUiTransition = null;
    let uiTransitionSequence = 0;
    let tabChangeSequence = 0;
    let selectedQuarantineId = null;
    let reviewAction = null;
    let reviewEvent = null;
    const auditDetailsCache = new Map();
    let editorDirty = false;
    let editorMode = "builder";
    let editorReturnFocus = null;
    let lastRefresh = null;
    let conditionSequence = 0;
    let webhookFieldSequence = 0;
    let webhookActionDestinationPreference = "";
    let trainerSelection = null;
    let trainerCaptures = [];
    let trainerInvoker = null;
    let trainerRestoreFocus = true;
    let trainerRequestVersion = 0;
    let trainerSampleMode = "manual";
    let parserRuleSample = null;
    let parserRuleEvent = null;
    let parserRuleInvoker = null;
    let parserRuleRestoreFocus = true;
    let activeParserCapture = null;
    let capturePollTimer = null;
    let captureRequestVersion = 0;
    let lastGoreloTemplateTarget = null;
    const goreloCatalogs = new Map();
    const goreloCatalogLoads = new Map();
    let goreloActionPreferences = null;
    const byId = (id) => document.getElementById(id);
    const templates = {
      route: { name:"Route monitoring vendor", description:"Known vendor alerts to the default Gorelo mailbox", priority:100, enabled:true, match:"all", conditions:[{field:"from_domain",operator:"equals",value:"vendor.example",caseSensitive:false}], action:{type:"forward",bypassSpam:false} },
      drop: { name:"Drop blocked sender", description:"High-confidence sender block", priority:10, enabled:true, match:"all", conditions:[{field:"from",operator:"equals",value:"spam@example.net",caseSensitive:false}], action:{type:"drop"} },
      quarantine: { name:"Quarantine executable attachments", description:"Hold messages containing executable-looking attachment names", priority:10, enabled:true, match:"all", conditions:[{field:"attachment_name",operator:"ends_with",value:".exe",caseSensitive:false}], action:{type:"quarantine"} }
    };
    const baseConditionFields = [
      ["from","Envelope sender","string"],["from_domain","Sender domain","string"],["to","Envelope recipient","string"],["to_local_part","Recipient local part","string"],["to_domain","Recipient domain","string"],
      ["subject","Subject","string"],["header","Header","string"],["message_size","Message size","number"],["spam_score","Spam score","number"],
      ["body_text","Body text","string"],["attachment_name","Attachment name","string"],["has_attachments","Has attachments","boolean"]
    ];
    let fields = baseConditionFields.slice();
    let fieldMap = Object.fromEntries(fields.map((item) => [item[0],{label:item[1],kind:item[2]}]));
    let webhookConditionKeys = [];
    function setWebhookConditionFields(keys) {
      webhookConditionKeys=keys.filter((key)=>/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key));
      fields=baseConditionFields.concat(webhookConditionKeys.map((key)=>["webhook:"+key,"Webhook · "+key,"string"]));
      fieldMap=Object.fromEntries(fields.map((item)=>[item[0],{label:item[1],kind:item[2]}]));
    }
    const webhookExtractionSources = [
      ["from","Envelope sender"],["from_domain","Sender domain"],["to","Envelope recipient"],["to_local_part","Recipient local part"],["subject","Subject"],["body_text","Body text"],["message_id","Message ID"],["header","Header value"],["literal","Fixed text"]
    ];
    const webhookExtractionSourceSet = new Set(webhookExtractionSources.map((item)=>item[0]));
    const trainerSourceLabels = {from:"From",to:"To",subject:"Subject",body_text:"Body"};
    const trainerSourceControls = {from:"trainerFrom",to:"trainerTo",subject:"trainerSubject",body_text:"trainerBody"};
    const goreloTemplateLabels = {ticketTitleTemplate:"ticket title",ticketDescriptionTemplate:"ticket description",ticketCreatedByTemplate:"created-by name",alertNameTemplate:"alert name",alertResourceTemplate:"alert resource",alertDescriptionTemplate:"alert description"};
    const mappedActionTypes = new Set(["forward_webhook","create_ticket","create_alert"]);
    const goreloActionTypes = new Set(["create_ticket","create_alert"]);
    const goreloGlobalCatalogKinds = ["groups","ticket-statuses","ticket-tags","ticket-types","users","agent-assets"];
    const goreloAssignmentDefinitions = [
      {key:"contact",label:"Customer contact",modeId:"ticketContactMode",fixedGroupId:"ticketContactFixedGroup",fixedId:"ticketContactId",resolverGroupId:"ticketContactResolverGroup",resolverFieldId:"ticketContactResolverField",resolverMatchId:"ticketContactResolverMatchBy",resolverProperty:"contactResolver",fixedProperty:"contactId",fixedNeedsClient:true,matchBy:new Set(["email","alias","name","id"])},
      {key:"agentAsset",label:"Managed device",modeId:"ticketAgentAssetMode",fixedGroupId:"ticketAgentAssetFixedGroup",fixedId:"ticketAgentAssetIds",resolverGroupId:"ticketAgentAssetResolverGroup",resolverFieldId:"ticketAgentAssetResolverField",resolverMatchId:"ticketAgentAssetResolverMatchBy",resolverProperty:"agentAssetResolver",fixedProperty:"agentAssetIds",fixedNeedsClient:true,matchBy:new Set(["name","serial_number","id"])},
      {key:"leadAssignee",label:"Gorelo technician",modeId:"ticketLeadAssigneeMode",fixedGroupId:"ticketLeadAssigneeFixedGroup",fixedId:"ticketLeadAssigneeId",resolverGroupId:"ticketLeadAssigneeResolverGroup",resolverFieldId:"ticketLeadAssigneeResolverField",resolverMatchId:"ticketLeadAssigneeResolverMatchBy",resolverProperty:"leadAssigneeResolver",fixedProperty:"leadAssigneeId",fixedNeedsClient:false,matchBy:new Set(["email","name","id"])}
    ];
    const operatorLabels = { equals:"equals",not_equals:"does not equal",contains:"contains",not_contains:"does not contain",starts_with:"starts with",ends_with:"ends with",wildcard:"matches wildcard",in:"is one of",gte:"is at least",lte:"is at most",exists:"exists" };
    const contentFields = new Set(["body_text","attachment_name","has_attachments"]);
    const existsFields = new Set(["header","body_text","attachment_name","has_attachments"]);
    const allowedStatusClasses = new Set(["forwarded","quarantined","dropped","rejected","failed"]);
    const allowedQuarantineClasses = new Set(["pending","releasing","released","dismissed","release_failed","expired"]);
    const deliveryActionTypes = new Set(["forward_email","create_ticket","create_alert","send_webhook"]);
    const deliveryStates = new Set(["pending","delivering","succeeded","failed","uncertain"]);
    const deliveryAttemptOutcomes = new Set(["succeeded","failed","uncertain"]);

    function node(tag,text,className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    }
    const iconPaths = {
      rules:"M4 6h16M4 12h10M4 18h7M18 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4M15 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
      quarantine:"M12 3 20 7v5c0 4.5-3.3 7.5-8 9-4.7-1.5-8-4.5-8-9V7zM12 8v4M12 16h.01",
      audit:"M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6",
      test:"M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8",
      setup:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 12H2m20 0h-2M12 4V2m0 20v-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4",
      search:"M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12m5 11 4 4",
      refresh:"M20 6v5h-5M4 18v-5h5M18.5 9a7 7 0 0 0-12-2L4 11m16 2-2.5 4a7 7 0 0 1-12-2",
      plus:"M12 5v14M5 12h14",
      clients:"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m6-2a3 3 0 1 0 0-6M2 21a7 7 0 0 1 14 0m1-6a5 5 0 0 1 5 5",
      webhooks:"M8 12a4 4 0 1 1 4-4m4 4a4 4 0 1 1-4 4m0-8v8",
      success:"m5 12 4 4L19 6",
      warning:"M12 3 22 20H2zM12 9v4M12 17h.01",
      info:"M12 11v6M12 7h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
      forward:"M5 12h14m-6-6 6 6-6 6",
      api:"M8 5 3 12l5 7m8-14 5 7-5 7M14 4l-4 16",
      reject:"M6 6l12 12M18 6 6 18",
      close:"M6 6l12 12M18 6 6 18"
    };
    const iconAliases = {RL:"rules",Q:"quarantine",AU:"audit",CL:"clients",WH:"webhooks","?":"search","!":"warning","✓":"success"};
    function iconNode(name,className="icon") {
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("aria-hidden","true"); svg.classList.add(...className.split(" "));
      const path=document.createElementNS("http://www.w3.org/2000/svg","path"); path.setAttribute("d",iconPaths[iconAliases[name]||name]||iconPaths.search); svg.append(path); return svg;
    }
    function replaceIcon(element,name) { element.textContent=""; element.append(iconNode(name)); }
    function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }
    function editable(rule) { const {id,createdAt,updatedAt,...input} = rule; return input; }
    function setText(id,value) { byId(id).textContent = String(value); }
    function setMetric(id,value) {
      const element=byId(id); const next=String(value); if (element.textContent===next) return;
      element.textContent=next; element.classList.remove("metric-changed"); void element.offsetWidth; element.classList.add("metric-changed");
    }
    function showError(id,error) { byId(id).textContent = error instanceof Error ? error.message : String(error); }
    function clearError(id) { byId(id).textContent = ""; }
    function reducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    function transitionUi(update) {
      if (document.visibilityState!=="visible"||reducedMotion()||typeof document.startViewTransition!=="function") { update(); return Promise.resolve(); }
      const sequence=++uiTransitionSequence;
      if (activeUiTransition) { activeUiTransition.skipTransition(); activeUiTransition=null; update(); return Promise.resolve(); }
      try {
        const transition=document.startViewTransition(()=>{ if (sequence===uiTransitionSequence) update(); }); activeUiTransition=transition;
        return transition.finished.catch(()=>{}).finally(()=>{ if (activeUiTransition===transition) activeUiTransition=null; });
      }
      catch { if (sequence===uiTransitionSequence) update(); return Promise.resolve(); }
    }
    function updateConnectionState() {
      const syncing=activeRequests>0; byId("connectionDot").classList.toggle("syncing",syncing); setText("connectionLabel",syncing?"Syncing":"Session active");
    }
    function setBusy(button,busy,label) {
      if (!button) return;
      if (busy) {
        button.dataset.idleLabel = button.textContent || "";
        button.textContent = label;
        button.disabled = true;
        button.setAttribute("aria-busy","true");
      } else {
        if (Object.hasOwn(button.dataset,"idleLabel")) button.textContent = button.dataset.idleLabel;
        delete button.dataset.idleLabel;
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
    async function runBusy(button,label,task) {
      if (button.disabled) return;
      setBusy(button,true,label);
      try { return await task(); } finally { setBusy(button,false,label); }
    }
    function showToast(message,tone) {
      const toast = node("div",undefined,"toast"+(tone === "error" ? " error-tone" : ""));
      toast.setAttribute("role",tone === "error" ? "alert" : "status");
      toast.append(node("span",message));
      const close = node("button","×");
      close.type = "button";
      close.setAttribute("aria-label","Dismiss notification");
      close.onclick = () => toast.remove();
      toast.append(close);
      byId("toastRegion").append(toast);
      setTimeout(() => toast.remove(),4500);
    }
    function formatApiError(response,data,raw) {
      const title = data && data.error && data.error.title ? data.error.title : (raw || response.statusText || "Request failed");
      const details = data && data.error && data.error.details ? "\n"+JSON.stringify(data.error.details,null,2) : "";
      return title+details;
    }
    async function api(path,options={},timeoutMs=15000) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),timeoutMs);
      activeRequests+=1; updateConnectionState();
      try {
        const response = await fetch(path,{...options,signal:controller.signal,headers:{"authorization":"Bearer "+token,"content-type":"application/json",...(options.headers||{})}});
        const raw = await response.text();
        let data = {};
        if (raw) { try { data = JSON.parse(raw); } catch { data = {}; } }
        if (response.status === 401 && !byId("workspace").classList.contains("hidden")) {
          forceDisconnect("Your admin session expired. Enter the token again.");
        }
        if (!response.ok) { const requestError=new Error(formatApiError(response,data,raw)); requestError.status=response.status; requestError.details=data&&data.error&&data.error.details; throw requestError; }
        return data;
      } catch (error) {
        if (error && error.name === "AbortError") throw new Error("The Worker did not respond before the request deadline.");
        throw error;
      } finally { clearTimeout(timeout); activeRequests=Math.max(0,activeRequests-1); updateConnectionState(); }
    }

    function loading(container) {
      container.textContent = "";
      const wrap = node("div",undefined,"loading-state");
      const status=node("span","Loading…","visually-hidden"); status.setAttribute("role","status");
      wrap.append(status,node("div",undefined,"skeleton"),node("div",undefined,"skeleton"));
      container.append(wrap);
      container.setAttribute("aria-busy","true");
    }
    function emptyState(icon,title,copy,buttonLabel,buttonAction) {
      const wrap = node("div",undefined,"empty-state");
      const mark=node("div",undefined,"empty-icon"); mark.setAttribute("aria-hidden","true"); mark.append(iconNode(icon));
      wrap.append(mark,node("h3",title),node("p",copy));
      if (buttonLabel) { const button=node("button",buttonLabel,"btn btn-primary primary small"); button.type="button"; button.onclick=buttonAction; wrap.append(button); }
      return wrap;
    }
    function titleCase(value) { return String(value||"").replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase()); }
    function eventKey(event) { return String(event.eventId||event.id||""); }
    function pageCursor(value) { if (value===null) return null; if (typeof value!=="string"||value.length>600||!/^[-_A-Za-z0-9]+$/.test(value)) throw new Error("The Worker returned an invalid pagination cursor."); return value; }
    function mergeEventPages(current,incoming) { const merged=new Map(current.map((event)=>[eventKey(event),event])); incoming.forEach((event)=>merged.set(eventKey(event),event)); return [...merged.values()]; }
    function quarantineState(event) { return event.quarantine?.state||"pending"; }
    function quarantineStateLabel(event) { const state=quarantineState(event); return state==="releasing"&&Boolean(event.quarantine?.lastError)?"Release outcome uncertain":titleCase(state); }
    function formatDate(value) {
      if (!value) return "—";
      const date=new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    function formatBytes(value) {
      const bytes=Number(value||0); if (!Number.isFinite(bytes)) return "—";
      if (bytes<1024) return bytes.toLocaleString()+" B";
      if (bytes<1048576) return (bytes/1024).toFixed(1)+" KiB";
      return (bytes/1048576).toFixed(1)+" MiB";
    }
    function renderRuntime() {
      const container=byId("quarantineMode"); container.textContent="";
      const features=runtimeConfig?.features||{};
      const icon=node("span",undefined,"mode-icon"); icon.setAttribute("aria-hidden","true"); icon.append(iconNode(features.rawQuarantine?"success":"warning"));
      const copy=node("div");
      if (features.rawQuarantine && features.release) {
        container.classList.add("info");
        copy.append(node("strong","Stored review and release are active"),node("p","Held originals can be inspected as safe text, downloaded as EML, and released to an approved Gorelo route. Retention: "+runtimeConfig.eventRetentionDays+" days."));
      } else if (features.rawQuarantine) {
        container.classList.add("info");
        copy.append(node("strong","Stored review is active; automated release is not configured"),node("p","You can inspect and download retained originals here, then handle release through your review workflow. Retention: "+runtimeConfig.eventRetentionDays+" days."));
      } else {
        container.classList.remove("info");
        const destination=runtimeConfig?.quarantineAddress||"the configured review mailbox";
        copy.append(node("strong","Mailbox-forward quarantine"),node("p","Original messages are forwarded to "+destination+" and are not stored by this Worker. This queue is an audit index; inspect and release mail in that mailbox."));
      }
      container.append(icon,copy);
    }
    function updateSummary() {
      const enabled = rulesCache.filter((rule) => rule.enabled).length;
      const failures = eventsCache.filter((event) => event.status === "failed").length;
      const pending = Number(quarantineSummary.pending||quarantineCache.filter((event)=>quarantineState(event)==="pending").length||0);
      setMetric("enabledRuleCount",enabled);
      setMetric("pendingQuarantineCount",pending);
      setMetric("failureCount",failures);
      setText("ruleTabCount",rulesCache.length);
      setText("quarantineTabCount",pending);
      setText("auditTabCount",eventsCache.length);
      setText("quarantinePending",pending);
      setText("quarantineFailed",Number(quarantineSummary.releaseFailed||0));
      setText("quarantineReleased",Number(quarantineSummary.released||0));
      setText("quarantineDismissed",Number(quarantineSummary.dismissed||0));
      setMetric("spamPostureValue",runtimeConfig?titleCase(runtimeConfig.spamAction):"—");
      setText("spamPostureLabel",runtimeConfig?"Global spam action · threshold "+runtimeConfig.spamThreshold:"Loading spam policy");
      if (lastRefresh) setText("lastRefreshLabel","Ready · refreshed "+lastRefresh.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
    }
    function mailboxById(id) { return goreloMailboxes.find((mailbox)=>mailbox.id===id); }
    function defaultGoreloMailbox() { return mailboxById(goreloMailboxDefaultId)||goreloMailboxes.find((mailbox)=>mailbox.isDefault)||null; }
    function mailboxRouteLabel(action) {
      if (action.mailboxId) { const mailbox=mailboxById(action.mailboxId); return mailbox?mailbox.name+" · "+mailbox.address:"Unavailable mailbox · "+action.mailboxId; }
      if (action.destination) return action.destination+" · legacy address";
      const mailbox=defaultGoreloMailbox(); return mailbox?mailbox.name+" · "+mailbox.address:"default Gorelo mailbox";
    }
    function actionLabel(action) {
      if (action.type === "forward") return "Forward → "+mailboxRouteLabel(action);
      if (action.type === "forward_webhook") {
        const forward="Forward → "+mailboxRouteLabel(action); const registered=webhooks.find((item)=>item.id===action.webhookDestinationId); const webhookName=registered?.name||action.webhookDestinationId||"unavailable destination"; const fieldCount=Array.isArray(action.fields)?action.fields.length:0;
        return forward+" · Signed webhook → "+webhookName+" · "+fieldCount+" field"+(fieldCount===1?"":"s");
      }
      if (action.type === "create_ticket" || action.type === "create_alert") {
        const fieldCount=Array.isArray(action.fields)?action.fields.length:0; const target=action.clientId?"client #"+action.clientId:"client from “"+(action.clientIdentityField||"unconfigured")+"”";
        return (action.type==="create_ticket"?"API ticket":"API alert")+" · "+target+" · "+fieldCount+" mapped field"+(fieldCount===1?"":"s")+" · no email forward";
      }
      if (action.type === "quarantine") return action.destination ? "Quarantine → "+action.destination : "Quarantine → configured review route";
      if (action.type === "reject") return "Reject → "+action.reason;
      return "Accept and discard";
    }
    function actionBadgeLabel(action) { if (action.type==="forward_webhook") return "Forward + webhook"; if (action.type==="create_ticket") return "API ticket"; if (action.type==="create_alert") return "API alert"; return action.type; }
    function displayValue(value) {
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "boolean") return value ? "yes" : "no";
      return String(value);
    }
    function conditionLabel(condition) {
      const field = fieldMap[condition.field] ? fieldMap[condition.field].label : condition.field;
      const header = condition.field === "header" && condition.headerName ? " “"+condition.headerName+"”" : "";
      const value = condition.value === undefined ? "" : " “"+displayValue(condition.value)+"”";
      return field+header+" "+(operatorLabels[condition.operator]||condition.operator)+value;
    }
    function renderRules() {
      const container = byId("rules");
      container.removeAttribute("aria-busy");
      container.textContent = "";
      const systemRules=[
        {name:"System · Spam policy",description:"Evaluated when a message reaches the configured spam threshold. User rules cannot bypass this unless explicitly configured.",action:runtimeConfig?.spamAction||"forward",condition:"Spam score meets threshold "+String(runtimeConfig?.spamThreshold??"—"),badge:"System"},
        {name:"System · Unmatched fallback",description:"Evaluated after all enabled routing rules when no rule matches the message.",action:runtimeConfig?.defaultAction||"forward",condition:"No enabled rule matched",badge:"System"}
      ];
      systemRules.forEach((rule,index)=>{ const article=node("article",undefined,"rule-card system-rule action-"+rule.action); article.setAttribute("role","listitem"); const priority=node("div",undefined,"priority"); priority.append(node("strong",index===0?"—":"∞"),node("span","System")); const main=node("div",undefined,"rule-main"); const titleLine=node("div",undefined,"rule-title-line"); titleLine.append(node("h3",rule.name),node("span",actionBadgeLabel({type:rule.action}),"badge "+rule.action),node("span",rule.badge,"badge enabled")); const chips=node("div",undefined,"chip-row"); chips.append(node("span",rule.condition,"chip")); main.append(titleLine,node("p",rule.description,"rule-description"),chips,node("p",actionLabel({type:rule.action}),"rule-description")); const note=node("div",undefined,"rule-actions"); note.append(node("span","Read-only policy","retention-note")); article.append(priority,main,note); container.append(article); });
      if (!rulesCache.length) { container.append(emptyState("RL","No custom routing rules yet","The system policies above are active. Add a rule to route specific messages before the fallback.","Create your first rule",() => openEditor(null))); updateSummary(); return; }
      rulesCache.forEach((rule) => {
        const article = node("article",undefined,"rule-card action-"+rule.action.type+(rule.enabled ? "" : " disabled"));
        article.setAttribute("role","listitem");
        article.setAttribute("aria-labelledby","rule-title-"+rule.id);
        const priority = node("div",undefined,"priority");
        priority.append(node("strong",rule.priority),node("span","Priority"));
        const main = node("div",undefined,"rule-main");
        const titleLine = node("div",undefined,"rule-title-line");
        const title = node("h3",rule.name); title.id="rule-title-"+rule.id;
        titleLine.append(title,node("span",actionBadgeLabel(rule.action),"badge "+rule.action.type),node("span",rule.enabled?"Enabled":"Disabled","badge "+(rule.enabled?"enabled":"disabled")));
        main.append(titleLine);
        if (rule.description) main.append(node("p",rule.description,"rule-description"));
        const chips = node("div",undefined,"chip-row");
        rule.conditions.slice(0,4).forEach((condition,index) => {
          if (index > 0) chips.append(node("span",rule.match === "all" ? "AND" : "OR","chip connector"));
          chips.append(node("span",conditionLabel(condition),"chip"));
        });
        if (rule.conditions.length > 4) chips.append(node("span","+"+(rule.conditions.length-4)+" more","chip"));
        main.append(chips,node("p",actionLabel(rule.action),"rule-description"));
        const actions = node("div",undefined,"rule-actions");
        const toggle = node("button",undefined,"switch-button small");
        toggle.type="button"; toggle.setAttribute("role","switch"); toggle.setAttribute("aria-checked",String(rule.enabled)); toggle.setAttribute("aria-label",(rule.enabled?"Disable ":"Enable ")+rule.name);
        toggle.onclick = () => runBusy(toggle,"Saving…",async() => {
          clearError("rulesNotice");
          try { await api("/api/v1/rules/"+encodeURIComponent(rule.id),{method:"PUT",body:JSON.stringify({...editable(rule),enabled:!rule.enabled})}); await loadRules(); showToast((rule.enabled?"Disabled ":"Enabled ")+rule.name); }
          catch(error) { showError("rulesNotice",error); showToast(error.message,"error"); }
        });
        const edit = node("button","Edit","small"); edit.type="button"; edit.setAttribute("aria-label","Edit "+rule.name); edit.onclick=() => openEditor(rule,edit);
        const remove = node("button","Delete","danger small"); remove.type="button"; remove.setAttribute("aria-label","Delete "+rule.name);
        remove.onclick=() => {
          if (!confirm("Delete rule ‘"+rule.name+"’? This takes effect immediately.")) return;
          runBusy(remove,"Deleting…",async() => {
            clearError("rulesNotice");
            try { await api("/api/v1/rules/"+encodeURIComponent(rule.id),{method:"DELETE"}); await loadRules(); showToast("Deleted "+rule.name); }
            catch(error) { showError("rulesNotice",error); showToast(error.message,"error"); }
          });
        };
        actions.append(toggle,edit,remove);
        article.append(priority,main,actions);
        container.append(article);
      });
      // System policies are the final safety-net decisions, so keep them
      // visually distinct and at the bottom of the evaluation list.
      [...container.querySelectorAll(".system-rule")].forEach((article) => container.append(article));
      updateSummary();
    }
    async function loadRules() {
      const container=byId("rules"); clearError("rulesNotice"); loading(container);
      try { const data=await api("/api/v1/rules"); rulesCache=data.rules; lastRefresh=new Date(); renderRules(); }
      catch(error) { container.removeAttribute("aria-busy"); container.textContent=""; container.append(emptyState("!","Rules unavailable",error.message,"Try again",loadRules)); showError("rulesNotice",error); }
    }

    function makeOption(value,label) { const option=node("option",label); option.value=value; return option; }
    function isGoreloActionType(type=byId("actionType").value) { return goreloActionTypes.has(type); }
    function goreloCatalogKey(kind,clientId) { return kind+(clientId?":"+clientId:""); }
    function catalogItems(kind,clientId) { return goreloCatalogs.get(goreloCatalogKey(kind,clientId))?.items||[]; }
    function selectedOptionValues(select) { return [...select.selectedOptions].map((option)=>option.value).filter(Boolean); }
    function validGoreloCatalogItem(kind,item) {
      if (!item||typeof item!=="object"||typeof item.name!=="string"||item.name.length>512) return false;
      if (kind==="agent-assets") return typeof item.id==="string"&&(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)||/^[1-9][0-9]{0,18}$/.test(item.id));
      return Number.isSafeInteger(item.id)&&item.id>0;
    }
    function parseGoreloCatalogResponse(data,kind,clientId) {
      const catalog=data&&data.catalog;
      if (!catalog||catalog.kind!==kind||!Array.isArray(catalog.items)||!catalog.items.every((item)=>validGoreloCatalogItem(kind,item))||!Number.isSafeInteger(catalog.totalCount)||catalog.totalCount!==catalog.items.length||catalog.pagination?.hasMore===true||(clientId!==undefined&&catalog.clientId!==clientId)) throw new Error("The Worker returned an invalid "+titleCase(kind)+" catalog.");
      return catalog;
    }
    async function loadGoreloActionCatalog(kind,clientId,force=false) {
      const key=goreloCatalogKey(kind,clientId); if (!force&&goreloCatalogs.has(key)) return goreloCatalogs.get(key); if (goreloCatalogLoads.has(key)) return goreloCatalogLoads.get(key);
      const parameters=new URLSearchParams(); if (clientId) parameters.set("clientId",String(clientId)); if (force) parameters.set("refresh","true");
      const request=api("/api/v1/integrations/gorelo/catalogs/"+encodeURIComponent(kind)+(parameters.size?"?"+parameters.toString():""))
        .then((data)=>{ const catalog=parseGoreloCatalogResponse(data,kind,clientId); goreloCatalogs.set(key,catalog); return catalog; })
        .finally(()=>goreloCatalogLoads.delete(key));
      goreloCatalogLoads.set(key,request); return request;
    }
    function catalogItemLabel(kind,item) {
      const details=[]; if (item.email) details.push(item.email); if (item.alias) details.push(item.alias); if (item.serialNumber) details.push(item.serialNumber); if (item.status) details.push(item.status); return item.name+(details.length?" · "+details.join(" · "):"")+" · #"+item.id;
    }
    function populateCatalogSelect(id,kind,options={}) {
      const select=byId(id); const current=selectedOptionValues(select); const supplied=options.preferred!==undefined; const preferred=(supplied?options.preferred:current).filter((value)=>value!==undefined&&value!==null&&value!=="").map(String); const items=options.items||catalogItems(kind,options.clientId); select.textContent="";
      if (!select.multiple) { const prompt=node("option",options.prompt||"Select an option"); prompt.value=""; select.append(prompt); }
      if (select.multiple&&!items.length&&!preferred.length) { const empty=node("option",options.emptyLabel||"No options returned"); empty.value=""; empty.disabled=true; select.append(empty); }
      const known=new Set(); items.forEach((item)=>{ const value=String(item.id); known.add(value); select.append(makeOption(value,catalogItemLabel(kind,item))); });
      preferred.filter(Boolean).forEach((value)=>{ if (!known.has(value)) select.append(makeOption(value,"Saved ID "+value+" · not in current catalog")); });
      [...select.options].forEach((option)=>{ option.selected=preferred.includes(option.value); });
    }
    function populateGoreloClientSelect() {
      const select=byId("goreloClientId"); const current=select.value; const preferred=goreloActionPreferences?.clientId===undefined?current:String(goreloActionPreferences.clientId); const active=goreloClients.filter((client)=>!client.stale); select.textContent=""; const prompt=node("option",active.length?"Select an imported client":"Import current clients in Setup first"); prompt.value=""; select.append(prompt);
      active.forEach((client)=>select.append(makeOption(String(client.id),client.name+" · #"+client.id))); if (preferred&&!active.some((client)=>String(client.id)===preferred)) select.append(makeOption(preferred,"Saved client #"+preferred+" · not current")); select.value=preferred; select.disabled=!isGoreloActionType()||byId("goreloClientMode").value!=="fixed"; select.required=isGoreloActionType()&&byId("goreloClientMode").value==="fixed";
    }
    function goreloExtractionKeys() {
      const keys=[]; const seen=new Set(); [...byId("webhookFields").children].forEach((row)=>{ const key=row.querySelector('[data-role="webhook-key"]')?.value.trim(); if (key&&!seen.has(key)) { seen.add(key); keys.push(key); } }); return keys;
    }
    function populateGoreloResolverField(select,preferred) {
      const wanted=preferred===undefined?select.value:preferred; const keys=goreloExtractionKeys(); select.textContent=""; const prompt=node("option",keys.length?"Select an extraction field":"Add an extraction field first"); prompt.value=""; select.append(prompt); keys.forEach((key)=>select.append(makeOption(key,key))); select.value=keys.includes(wanted)?wanted:"";
    }
    function populateGoreloAssignmentOptions(preferences=goreloActionPreferences) {
      goreloAssignmentDefinitions.forEach((definition)=>populateGoreloResolverField(byId(definition.resolverFieldId),preferences?.[definition.resolverProperty]?.field)); updateGoreloAssignmentControls();
    }
    function populateGoreloIdentityOptions(preferred) {
      const select=byId("goreloClientIdentityField"); const wanted=preferred===undefined?select.value:preferred; const keys=goreloExtractionKeys();
      select.textContent=""; const prompt=node("option",keys.length?"Select an extraction field":"Add an extraction field first"); prompt.value=""; select.append(prompt); keys.forEach((key)=>select.append(makeOption(key,key))); select.value=keys.includes(wanted)?wanted:"";
      populateGoreloAssignmentOptions();
    }
    function populateGoreloCatalogControls() {
      const preferences=goreloActionPreferences; populateGoreloClientSelect();
      populateCatalogSelect("ticketStatusId","ticket-statuses",{prompt:"Select a status",preferred:preferences?[preferences.statusId]:undefined});
      populateCatalogSelect("ticketGroupId","groups",{prompt:"Select a group",preferred:preferences?[preferences.groupId]:undefined});
      populateCatalogSelect("ticketTypeId","ticket-types",{prompt:"Select a ticket type",preferred:preferences?[preferences.typeId]:undefined});
      populateCatalogSelect("ticketLeadAssigneeId","users",{prompt:"Select a technician",preferred:preferences&&!preferences.leadAssigneeResolver?[preferences.leadAssigneeId]:preferences?[]:undefined});
      populateCatalogSelect("ticketAssistingIds","users",{emptyLabel:"No users returned",preferred:preferences?preferences.assistingAssigneeIds||[]:undefined});
      populateCatalogSelect("ticketWatcherIds","users",{emptyLabel:"No users returned",preferred:preferences?preferences.watcherIds||[]:undefined});
      populateCatalogSelect("ticketTagIds","ticket-tags",{emptyLabel:"No tags returned",preferred:preferences?preferences.tagIds||[]:undefined});
      const clientId=byId("goreloClientMode").value==="fixed"?Number(byId("goreloClientId").value||0):0; const assets=catalogItems("agent-assets").filter((asset)=>clientId?asset.clientId===clientId:false);
      populateCatalogSelect("ticketAgentAssetIds","agent-assets",{items:assets,emptyLabel:clientId?"No matching agent assets":"Choose a fixed client to select assets",preferred:preferences&&!preferences.agentAssetResolver?preferences.agentAssetIds||[]:preferences?[]:undefined});
      populateCatalogSelect("ticketLocationId","locations",{clientId,prompt:"No location",preferred:preferences?[preferences.locationId]:undefined});
      populateCatalogSelect("ticketContactId","contacts",{clientId,prompt:"Select a contact",preferred:preferences&&!preferences.contactResolver?[preferences.contactId]:preferences?[]:undefined});
      populateCatalogSelect("ticketCcContactIds","contacts",{clientId,emptyLabel:clientId?"No contacts returned":"Choose a fixed client to select contacts",preferred:preferences?preferences.ccContactIds||[]:undefined});
      populateGoreloAssignmentOptions(preferences); updateGoreloClientLinkage();
    }
    function updateGoreloCatalogStatus(failures=[]) {
      const status=byId("goreloCatalogStatus"); status.classList.toggle("warning",failures.length>0||!setupState?.gorelo?.configured); if (!setupState?.gorelo?.configured) { status.textContent="Configure and verify the Gorelo API in Setup before saving this action."; return; }
      if (failures.length) { status.textContent="Some selectors could not be refreshed: "+failures.join(", ")+". Existing IDs remain visible; retry before changing them."; return; }
      const snapshots=[...goreloCatalogs.values()]; const counts=snapshots.reduce((total,snapshot)=>total+snapshot.items.length,0); status.textContent="Loaded "+counts+" selector item"+(counts===1?"":"s")+" from complete bounded catalogs. Saving validates configuration but does not create a ticket or alert.";
    }
    async function ensureGoreloClientCatalogs(force=false) {
      if (!isGoreloActionType()||byId("actionType").value!=="create_ticket"||byId("goreloClientMode").value!=="fixed") return; const clientId=Number(byId("goreloClientId").value||0); if (!Number.isSafeInteger(clientId)||clientId<=0) { populateGoreloCatalogControls(); return; }
      const settled=await Promise.allSettled([loadGoreloActionCatalog("locations",clientId,force),loadGoreloActionCatalog("contacts",clientId,force)]); populateGoreloCatalogControls(); const failed=settled.flatMap((result,index)=>result.status==="rejected"?[index===0?"locations":"contacts"]:[]); updateGoreloCatalogStatus(failed);
    }
    async function ensureGoreloActionCatalogs(force=false) {
      if (!isGoreloActionType()) return; if (!setupState?.gorelo?.configured) { populateGoreloCatalogControls(); updateGoreloCatalogStatus(); return; }
      const kinds=byId("actionType").value==="create_ticket"?[...goreloGlobalCatalogKinds]:[]; const tasks=[loadClientDirectory(force),...kinds.map((kind)=>loadGoreloActionCatalog(kind,undefined,force))]; const settled=await Promise.allSettled(tasks); populateGoreloCatalogControls(); const failures=settled.flatMap((result,index)=>result.status==="rejected"?[index===0?"clients":kinds[index-1]]:[]); updateGoreloCatalogStatus(failures); if (!failures.length) await ensureGoreloClientCatalogs(force);
    }
    function operatorsFor(field) {
      const kind=fieldMap[field].kind;
      if (kind === "number") return ["equals","not_equals","gte","lte"];
      if (kind === "boolean") return existsFields.has(field) ? ["equals","not_equals","exists"] : ["equals","not_equals"];
      const result=["equals","not_equals","contains","not_contains","starts_with","ends_with","wildcard","in"];
      if (existsFields.has(field)) result.push("exists");
      return result;
    }
    function renderConditionValue(row,presetValue,presetHeader,presetCase) {
      const field=row.querySelector('[data-role="field"]').value;
      const operator=row.querySelector('[data-role="operator"]').value;
      const valueWrap=row.querySelector('[data-role="value-wrap"]');
      const meta=row.querySelector('[data-role="meta"]');
      valueWrap.textContent=""; meta.textContent="";
      if (operator === "exists") valueWrap.append(node("span","No value required","field-help"));
      else if (fieldMap[field].kind === "boolean") {
        const select=node("select"); select.dataset.role="value"; select.setAttribute("aria-label","Condition value"); select.append(makeOption("true","Yes"),makeOption("false","No")); select.value=String(presetValue === undefined ? true : presetValue); valueWrap.append(select);
      } else {
        const input=node("input"); input.dataset.role="value"; input.setAttribute("aria-label","Condition value");
        if (fieldMap[field].kind === "number") { input.type="number"; input.step="1"; input.value=presetValue === undefined ? "0" : String(presetValue); }
        else { input.type="text"; input.value=Array.isArray(presetValue)?presetValue.join(", "):(presetValue === undefined?"":String(presetValue)); input.placeholder=operator === "in" ? "value one, value two" : "Value to match"; }
        valueWrap.append(input);
      }
      if (field === "header") {
        const wrap=node("label",undefined,"inline-check"); wrap.append(node("span","Header name"));
        const input=node("input"); input.type="text"; input.dataset.role="header-name"; input.value=presetHeader||""; input.placeholder="X-Vendor-Alert"; input.required=true; wrap.append(input); meta.append(wrap);
      }
      if (field.startsWith("webhook:")) meta.append(node("span","From selected webhook sample · "+field.slice(8),"mime-hint"));
      if (fieldMap[field].kind === "string" && operator !== "exists") {
        const label=node("label",undefined,"inline-check"); const check=node("input"); check.type="checkbox"; check.dataset.role="case"; check.checked=Boolean(presetCase); label.append(check,node("span","Case sensitive")); meta.append(label);
      }
      if (contentFields.has(field)) meta.append(node("span","Requires MIME inspection","mime-hint"));
    }
    function renumberConditions() {
      [...byId("conditions").children].forEach((row,index) => { row.querySelector(".condition-index").textContent=String(index+1); row.querySelector(".remove-condition").setAttribute("aria-label","Remove condition "+(index+1)); });
    }
    function addConditionRow(condition={field:"subject",operator:"contains",value:"",caseSensitive:false}) {
      conditionSequence += 1;
      const displayField=condition.field==="webhook"?"webhook:"+condition.webhookKey:condition.field;
      const row=node("div",undefined,"condition-row"); row.dataset.conditionId=String(conditionSequence);
      row.append(node("div","","condition-index"));
      const content=node("div"); const grid=node("div",undefined,"condition-grid");
      const fieldWrap=node("div",undefined,"form-field"); const fieldLabel=node("label","Field");
      const fieldSelect=node("select"); fieldSelect.dataset.role="field"; fieldSelect.setAttribute("aria-label","Condition field"); fields.forEach((item)=>fieldSelect.append(makeOption(item[0],item[1]))); fieldSelect.value=displayField;
      fieldWrap.append(fieldLabel,fieldSelect);
      const operatorWrap=node("div",undefined,"form-field"); operatorWrap.append(node("label","Operator"));
      const operatorSelect=node("select"); operatorSelect.dataset.role="operator"; operatorSelect.setAttribute("aria-label","Condition operator");
      const fillOperators=(requested) => { operatorSelect.textContent=""; const choices=operatorsFor(fieldSelect.value); choices.forEach((value)=>operatorSelect.append(makeOption(value,operatorLabels[value]))); operatorSelect.value=choices.includes(requested)?requested:choices[0]; };
      fillOperators(condition.operator); operatorWrap.append(operatorSelect);
      const valueWrap=node("div",undefined,"form-field"); valueWrap.append(node("label","Value")); const valueControl=node("div"); valueControl.dataset.role="value-wrap"; valueWrap.append(valueControl);
      grid.append(fieldWrap,operatorWrap,valueWrap);
      const meta=node("div",undefined,"condition-meta"); meta.dataset.role="meta"; content.append(grid,meta); row.append(content);
      const remove=node("button","×","remove-condition"); remove.type="button"; remove.onclick=()=>{ row.remove(); renumberConditions(); editorDirty=true; }; row.append(remove);
      byId("conditions").append(row);
      renderConditionValue(row,condition.value,condition.headerName,condition.caseSensitive);
      fieldSelect.onchange=()=>{ fillOperators("equals"); renderConditionValue(row,undefined,"",false); editorDirty=true; };
      operatorSelect.onchange=()=>{ const control=row.querySelector('[data-role="value"]'); const current=control?.value ?? ""; renderConditionValue(row,current,condition.headerName,Boolean(row.querySelector('[data-role="case"]')?.checked)); editorDirty=true; };
      renumberConditions();
    }
    function readCondition(row) {
      const field=row.querySelector('[data-role="field"]').value;
      const operator=row.querySelector('[data-role="operator"]').value;
      const result={field,operator,caseSensitive:Boolean(row.querySelector('[data-role="case"]')?.checked)};
      if (field.startsWith("webhook:")) { result.field="webhook"; result.webhookKey=field.slice(8); }
      if (field === "header") {
        const headerName=row.querySelector('[data-role="header-name"]').value.trim();
        if (!headerName) throw new Error("Every header condition needs a header name.");
        result.headerName=headerName;
      }
      if (operator !== "exists") {
        const control=row.querySelector('[data-role="value"]');
        if (fieldMap[field].kind === "number") {
          if (control.value === "" || !Number.isFinite(Number(control.value))) throw new Error(fieldMap[field].label+" needs a numeric value.");
          result.value=Number(control.value);
        } else if (fieldMap[field].kind === "boolean") result.value=control.value === "true";
        else if (operator === "in") {
          const values=control.value.split(",").map((item)=>item.trim()).filter(Boolean);
          if (!values.length) throw new Error(fieldMap[field].label+" needs at least one comma-separated value.");
          result.value=values;
        } else {
          if (!control.value) throw new Error(fieldMap[field].label+" needs a value.");
          result.value=control.value;
        }
      }
      return result;
    }
    function trainerControl(source) { return byId(trainerSourceControls[source]); }
    function currentMappedKeys() { return new Set([...byId("webhookFields").children].map((row)=>row.querySelector('[data-role="webhook-key"]')?.value.trim()).filter(Boolean)); }
    function isSafeTrainerKey(value) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)) return false;
      const lower=value.toLowerCase(); const exact=new Set(["__proto__","constructor","prototype","authorization","proxy_authorization","api_key","apikey","access_token","refresh_token","token","password","passwd","secret","client_secret","private_key","cookie","set_cookie","credential","credentials"]); if (exact.has(lower)) return false;
      const forbidden=new Set(["authorization","apikey","password","passwd","secret","token","cookie","credential","credentials"]); if (lower.split("_").some((segment)=>forbidden.has(segment))) return false;
      const compact=lower.replace(/[^a-z0-9]/g,""); return !["authorization","apikey","password","passwd","secret","token","cookie","credential","credentials","privatekey"].some((suffix)=>compact.endsWith(suffix));
    }
    function suggestedTrainerKey(source,text,start) {
      const before=text.slice(Math.max(0,start-100),start); const line=before.split(/\r?\n/).pop()||""; const match=line.match(/([A-Za-z][A-Za-z0-9 _./-]{0,48})\s*(?::|=|-)\s*$/); let key=(match?match[1]:source==="body_text"?"value":source).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,64); if (!key||!/^[a-z_]/.test(key)||!isSafeTrainerKey(key)) key=source==="body_text"?"value":source;
      const captured=new Set(trainerCaptures.map((item)=>item.key)); if (!captured.has(key)) return key; const base=key.slice(0,60); let suffix=2; while (captured.has(base+"_"+suffix)) suffix+=1; return base+"_"+suffix;
    }
    function summarizeTrainerValue(value) { const compact=String(value).replace(/\s+/g," ").trim(); return compact.length>76?compact.slice(0,73)+"…":compact; }
    function renderTrainerSelection() {
      const state=byId("trainerSelectionState"); state.textContent=""; state.classList.toggle("has-selection",Boolean(trainerSelection)); const icon=node("span",undefined,"trainer-selection-icon"); icon.setAttribute("aria-hidden","true"); icon.append(iconNode("api")); const copy=node("div");
      if (trainerSelection) copy.append(node("strong",trainerSourceLabels[trainerSelection.source]+" value selected"),node("span","“"+summarizeTrainerValue(trainerSelection.value)+"” · Name it to create a reusable variable."));
      else copy.append(node("strong","No value selected"),node("span","Highlight a changing value in From, To, Subject, or Body.")); state.append(icon,copy);
    }
    function appendTrainerTemplate(parent,text,captures) {
      let cursor=0; [...captures].sort((left,right)=>left.start-right.start).forEach((capture)=>{ if (capture.start<cursor||capture.end>text.length) return; parent.append(document.createTextNode(text.slice(cursor,capture.start))); const tokenMark=node("mark","{{"+capture.key+"}}"); tokenMark.title="Example: "+summarizeTrainerValue(capture.value); parent.append(tokenMark); cursor=capture.end; }); parent.append(document.createTextNode(text.slice(cursor)));
    }
    function renderTrainerPreview() {
      const preview=byId("trainerTemplatePreview"); preview.textContent=""; let rendered=false;
      Object.keys(trainerSourceControls).forEach((source)=>{ const text=trainerControl(source).value; const captures=trainerCaptures.filter((capture)=>capture.source===source); if (!text&&!captures.length) return; rendered=true; const section=node("div",undefined,"trainer-template-section"); section.append(node("span",trainerSourceLabels[source],"trainer-template-label")); const content=node("pre"); appendTrainerTemplate(content,text,captures); section.append(content); preview.append(section); });
      if (!rendered) preview.append(node("span","Add a sample and create a variable to see the reusable template.","trainer-template-empty"));
    }
    function renderTrainerCaptures() {
      const list=byId("trainerCaptures"); list.textContent=""; const existing=currentMappedKeys();
      trainerCaptures.forEach((capture,index)=>{ const item=node("li",undefined,"trainer-capture"); item.append(node("code","{{"+capture.key+"}}")); let detail=trainerSourceLabels[capture.source]+" · "+titleCase(capture.confidence||"unique")+" · “"+summarizeTrainerValue(capture.value)+"”"; if (existing.has(capture.key)) detail+=" · replaces current mapping"; item.append(node("p",detail)); const remove=node("button",undefined); remove.type="button"; remove.setAttribute("aria-label","Remove variable "+capture.key); remove.append(iconNode("close")); remove.onclick=()=>{ trainerCaptures.splice(index,1); renderTemplateTrainer(); }; item.append(remove); list.append(item); });
      if (!trainerCaptures.length) list.append(node("li","Select and name a value to start the template.","trainer-capture-empty"));
      setText("trainerCaptureSummary",trainerCaptures.length?trainerCaptures.length+" reusable "+(trainerCaptures.length===1?"variable":"variables")+" ready.":"No variables taught yet.");
    }
    function updateTrainerControls() {
      const key=byId("trainerKey").value.trim(); const duplicate=trainerCaptures.some((capture)=>capture.key===key); byId("createTrainerVariable").disabled=!trainerSelection||!isSafeTrainerKey(key)||duplicate||trainerCaptures.length>=50; byId("applyTrainerVariables").disabled=!trainerCaptures.length;
    }
    function renderTemplateTrainer() { renderTrainerSelection(); renderTrainerPreview(); renderTrainerCaptures(); updateTrainerControls(); }
    function resetTemplateTrainer() {
      trainerRequestVersion+=1; trainerSelection=null; trainerCaptures=[]; trainerSampleMode="manual"; Object.values(trainerSourceControls).forEach((id)=>{ byId(id).value=""; byId(id).readOnly=false; }); byId("useDryRunSample").classList.remove("hidden"); setText("trainerPrivacy","This sample is used only for the current preview. It is never saved with the rule or sent to Gorelo or a webhook."); byId("trainerKey").value=""; clearError("trainerError"); setBusy(byId("createTrainerVariable"),false); renderTemplateTrainer();
    }
    function trainerHasWork() { return Boolean(trainerCaptures.length||trainerSelection||byId("trainerKey").value.trim()||((trainerSampleMode==="manual"||trainerSampleMode==="dry_run")&&Object.values(trainerSourceControls).some((id)=>byId(id).value.length))); }
    function loadTrainerSample(sample) {
      trainerSampleMode="audit"; trainerSelection=null; trainerCaptures=[]; byId("trainerFrom").value=String(sample?.from||"").slice(0,320); byId("trainerTo").value=String(sample?.to||"").slice(0,320); byId("trainerSubject").value=String(sample?.subject||"").slice(0,998); byId("trainerBody").value=String(sample?.bodyText||"").slice(0,50000); Object.values(trainerSourceControls).forEach((id)=>{ byId(id).readOnly=true; }); byId("useDryRunSample").classList.add("hidden"); const source=sample?.body?.source; const expiry=sample?.body?.expiresAt?" It expires "+formatDate(sample.body.expiresAt)+".":""; const sourceCopy=source==="temporary_capture"?"This plain-text sample was captured temporarily for parser training.":source==="retained_original"?"This plain-text sample was derived from the retained original.":source==="audit_preview"?"This is the bounded plain-text preview retained in the audit.":"Only the audited envelope and subject are available."; setText("trainerPrivacy",sourceCopy+expiry+" The sample is never saved with the rule or sent to Gorelo or a webhook."); byId("trainerKey").value=""; clearError("trainerError"); renderTemplateTrainer();
    }
    function openTemplateTrainer(invoker,sample) {
      if (!mappedActionTypes.has(byId("actionType").value)) return; resetTemplateTrainer(); if (sample) loadTrainerSample(sample); trainerInvoker=invoker||document.activeElement; trainerRestoreFocus=true; byId("templateTrainerDialog").showModal(); (sample?.bodyText?byId("trainerBody"):byId("trainerSubject")).focus();
    }
    function closeTemplateTrainer(force=false,restore=true) {
      if (!force&&trainerHasWork()&&!confirm("Discard this sample and its taught variables?")) return false; trainerRestoreFocus=restore; if (byId("templateTrainerDialog").open) byId("templateTrainerDialog").close(); else { resetTemplateTrainer(); trainerInvoker=null; } return true;
    }
    function captureTrainerSelection(control) {
      if (!byId("templateTrainerDialog").open||!control.dataset.trainerSource) return; let start=control.selectionStart; let end=control.selectionEnd; const text=control.value; if (!Number.isInteger(start)||!Number.isInteger(end)||end<=start) return;
      while (start<end&&/\s/.test(text[start])) start+=1; while (end>start&&/\s/.test(text[end-1])) end-=1; if (end<=start) return; trainerSelection={source:control.dataset.trainerSource,start,end,value:text.slice(start,end)}; byId("trainerKey").value=suggestedTrainerKey(trainerSelection.source,text,start); clearError("trainerError"); renderTrainerSelection(); updateTrainerControls();
    }
    function handleTrainerSampleInput(control) {
      const source=control.dataset.trainerSource; const before=trainerCaptures.length; trainerRequestVersion+=1; trainerCaptures=trainerCaptures.filter((capture)=>capture.source!==source); if (trainerSelection?.source===source) trainerSelection=null; if (trainerCaptures.length<before) showError("trainerError",new Error(trainerSourceLabels[source]+" changed, so its learned variables were cleared. Select them again.")); else clearError("trainerError"); renderTemplateTrainer();
    }
    function loadDryRunIntoTrainer() {
      if (trainerHasWork()&&!confirm("Replace this sample and clear its taught variables?")) return; trainerRequestVersion+=1; trainerSelection=null; trainerCaptures=[]; trainerSampleMode="dry_run"; Object.values(trainerSourceControls).forEach((id)=>{ byId(id).readOnly=false; }); byId("trainerFrom").value=byId("testFrom").value.slice(0,320); byId("trainerTo").value=byId("testTo").value.slice(0,320); byId("trainerSubject").value=byId("testSubject").value.slice(0,998); byId("trainerBody").value=byId("testBody").value.slice(0,50000); setText("trainerPrivacy","This Dry-run sample remains only in this browser session. It is never saved with the rule or sent to Gorelo or a webhook."); byId("trainerKey").value=""; clearError("trainerError"); renderTemplateTrainer(); showToast("Dry-run sample loaded. Highlight the first changing value."); byId("trainerBody").focus();
    }
    async function createTrainerVariable() {
      clearError("trainerError"); const selection=trainerSelection?{...trainerSelection}:null; const key=byId("trainerKey").value.trim();
      try {
        if (!selection) throw new Error("Highlight the value to teach first."); if (selection.value.length>4000) throw new Error("A selected value can contain at most 4,000 characters."); if (!isSafeTrainerKey(key)) throw new Error("Use a safe variable name without credential words such as token, password, or secret."); if (trainerCaptures.some((capture)=>capture.key===key)) throw new Error("Each taught variable needs a unique name.");
        if (trainerCaptures.some((capture)=>capture.source===selection.source&&selection.start<capture.end&&selection.end>capture.start)) throw new Error("This selection overlaps a variable that is already taught."); const control=trainerControl(selection.source); if (control.value.slice(selection.start,selection.end)!==selection.value) throw new Error("The sample changed. Select the value again.");
        const requestVersion=++trainerRequestVersion; const button=byId("createTrainerVariable"); setBusy(button,true,"Learning…");
        try {
          const result=await api("/api/v1/extraction/infer",{method:"POST",body:JSON.stringify({key,source:selection.source,sample:control.value,selectionStart:selection.start,selectionEnd:selection.end})}); if (requestVersion!==trainerRequestVersion||!byId("templateTrainerDialog").open) return; if (!result||!result.field||result.field.key!==key||result.value!==selection.value) throw new Error("The Worker could not verify this selection exactly.");
          trainerCaptures.push({key,source:selection.source,start:selection.start,end:selection.end,value:result.value,field:result.field,confidence:result.confidence||"unique",warnings:Array.isArray(result.warnings)?result.warnings:[]}); trainerSelection=null; byId("trainerKey").value=""; control.setSelectionRange(selection.end,selection.end); renderTemplateTrainer(); const warnings=Array.isArray(result.warnings)?result.warnings.filter((warning)=>typeof warning==="string").slice(0,2):[]; if (warnings.length) showError("trainerError",new Error(warnings.join(" "))); else clearError("trainerError");
        } finally { if (requestVersion===trainerRequestVersion) { setBusy(button,false); updateTrainerControls(); } }
      } catch(error) { showError("trainerError",error); updateTrainerControls(); }
    }
    function applyTrainerVariables() {
      clearError("trainerError"); if (!trainerCaptures.length) return; const captures=trainerCaptures.map((capture)=>({key:capture.key,field:deepCopy(capture.field)})); const replacementKeys=new Set(captures.map((capture)=>capture.key)); const rows=[...byId("webhookFields").children]; const retained=rows.filter((row)=>!replacementKeys.has(row.querySelector('[data-role="webhook-key"]')?.value.trim())); if (retained.length+captures.length>50) { showError("trainerError",new Error("This rule can contain at most 50 extraction fields.")); return; }
      const webhookIdentity=byId("clientIdentityField").value; const goreloIdentity=byId("goreloClientIdentityField").value; const goreloAssignments=Object.fromEntries(goreloAssignmentDefinitions.map((definition)=>[definition.resolverProperty,{field:byId(definition.resolverFieldId).value}])); rows.forEach((row)=>{ if (replacementKeys.has(row.querySelector('[data-role="webhook-key"]')?.value.trim())) row.remove(); }); captures.forEach((capture)=>addWebhookFieldRow(capture.field)); renumberWebhookFields(); updateClientIdentityOptions(webhookIdentity); populateGoreloIdentityOptions(goreloIdentity); populateGoreloAssignmentOptions(goreloAssignments); editorDirty=true; const count=captures.length; closeTemplateTrainer(true); showToast(count+" "+(count===1?"variable is":"variables are")+" ready for this rule's Gorelo templates, assignments, and webhooks.");
    }
    function extractionControl(label,control,help) {
      const wrap=node("div",undefined,"form-field"); const visible=node("label",label); if (control.id) visible.htmlFor=control.id; wrap.append(visible,control); if (help) wrap.append(node("span",help,"field-help")); return wrap;
    }
    function renumberWebhookFields() {
      const rows=[...byId("webhookFields").children];
      rows.forEach((row,index)=>{ row.querySelector(".extraction-index").textContent=String(index+1); const remove=row.querySelector(".remove-extraction"); remove.disabled=rows.length===1; remove.setAttribute("aria-label","Remove mapped field "+(index+1)); });
      byId("addWebhookField").disabled=!mappedActionTypes.has(byId("actionType").value)||rows.length>=50; updateClientIdentityOptions();
    }
    function renderWebhookSourceFields(row,field={}) {
      const source=row.querySelector('[data-role="webhook-source"]').value; const container=row.querySelector('[data-role="webhook-source-fields"]'); container.textContent="";
      if (source==="header") {
        const input=node("input"); input.id="webhook-header-"+row.dataset.webhookFieldId; input.dataset.role="webhook-header-name"; input.maxLength=128; input.required=true; input.placeholder="X-Vendor-Alert"; input.value=field.headerName||""; container.append(extractionControl("Header name",input,"Header names are matched case-insensitively."));
      } else if (source==="literal") {
        const input=node("input"); input.id="webhook-literal-"+row.dataset.webhookFieldId; input.dataset.role="webhook-literal-value"; input.maxLength=4000; input.placeholder="monitoring-vendor"; input.value=field.value||""; container.append(extractionControl("Fixed value",input,"A constant included with every matching message; it may be blank."));
      }
    }
    function addWebhookFieldRow(field) {
      const container=byId("webhookFields"); if (container.children.length>=50) return;
      let preset=field; if (!preset) { const existing=new Set([...container.children].map((row)=>row.querySelector('[data-role="webhook-key"]')?.value.trim()).filter(Boolean)); let key="subject"; let suffix=2; while (existing.has(key)) { key="field_"+suffix; suffix+=1; } preset={key,source:"subject"}; } webhookFieldSequence+=1;
      const row=node("div",undefined,"extraction-row"); row.dataset.webhookFieldId=String(webhookFieldSequence); row.append(node("div","","extraction-index"));
      const content=node("div",undefined,"extraction-content"); const core=node("div",undefined,"extraction-core");
      const key=node("input"); key.id="webhook-key-"+webhookFieldSequence; key.dataset.role="webhook-key"; key.maxLength=64; key.required=true; key.pattern="[A-Za-z_][A-Za-z0-9_]*"; key.placeholder="e.g. client_name"; key.value=preset.key||""; key.setAttribute("aria-describedby","webhook-key-help-"+webhookFieldSequence);
      const keyWrap=extractionControl("Output key",key,"Letters, numbers, and underscores; begin with a letter or underscore."); keyWrap.querySelector(".field-help").id="webhook-key-help-"+webhookFieldSequence;
      const source=node("select"); source.id="webhook-source-"+webhookFieldSequence; source.dataset.role="webhook-source"; webhookExtractionSources.forEach((item)=>source.append(makeOption(item[0],item[1]))); source.value=webhookExtractionSourceSet.has(preset.source)?preset.source:"subject";
      core.append(keyWrap,extractionControl("Email source",source)); content.append(core);
      const sourceFields=node("div",undefined,"extraction-source-fields"); sourceFields.dataset.role="webhook-source-fields"; content.append(sourceFields);
      const advanced=node("details",undefined,"extraction-advanced"); advanced.append(node("summary","Extraction options")); const options=node("div",undefined,"extraction-options");
      const start=node("textarea"); start.id="webhook-start-"+webhookFieldSequence; start.dataset.role="webhook-start-after"; start.className="extraction-marker"; start.rows=2; start.maxLength=256; start.placeholder="Text before the value"; start.value=preset.startAfter||"";
      const end=node("textarea"); end.id="webhook-end-"+webhookFieldSequence; end.dataset.role="webhook-end-before"; end.className="extraction-marker"; end.rows=2; end.maxLength=256; end.placeholder="Text after the value"; end.value=preset.endBefore||"";
      const maximum=node("input"); maximum.id="webhook-max-"+webhookFieldSequence; maximum.dataset.role="webhook-max-characters"; maximum.type="number"; maximum.min="1"; maximum.max="4000"; maximum.step="1"; maximum.placeholder="1000"; maximum.value=preset.maxCharacters===undefined?"":String(preset.maxCharacters);
      const occurrence=node("input"); occurrence.id="webhook-occurrence-"+webhookFieldSequence; occurrence.dataset.role="webhook-occurrence"; occurrence.type="number"; occurrence.min="1"; occurrence.max="1000"; occurrence.step="1"; occurrence.placeholder="1"; occurrence.value=preset.occurrence===undefined?"":String(preset.occurrence);
      const fallback=node("input"); fallback.id="webhook-default-"+webhookFieldSequence; fallback.dataset.role="webhook-default"; fallback.maxLength=4000; fallback.placeholder="Optional fallback when no value is found";
      fallback.value=preset.defaultValue===undefined?"":preset.defaultValue;
      const startWrap=extractionControl("Start after",start); startWrap.classList.add("extraction-start"); const endWrap=extractionControl("End before",end); endWrap.classList.add("extraction-end"); const fallbackWrap=extractionControl("Default value",fallback); fallbackWrap.classList.add("extraction-default"); options.append(startWrap,endWrap,fallbackWrap,extractionControl("Maximum characters",maximum),extractionControl("Marker occurrence",occurrence,"Used when the same start marker appears more than once."));
      const checks=node("div",undefined,"extraction-checks"); const caseInput=node("input"); caseInput.type="checkbox"; caseInput.id="webhook-case-"+webhookFieldSequence; caseInput.dataset.role="webhook-case"; caseInput.checked=preset.caseSensitive===true; const caseLabel=node("label","Markers are case-sensitive"); caseLabel.htmlFor=caseInput.id; const caseWrap=node("div",undefined,"inline-check"); caseWrap.append(caseInput,caseLabel);
      const requiredInput=node("input"); requiredInput.type="checkbox"; requiredInput.id="webhook-required-"+webhookFieldSequence; requiredInput.dataset.role="webhook-required"; requiredInput.checked=preset.required===true; const requiredLabel=node("label","Fail delivery when missing"); requiredLabel.htmlFor=requiredInput.id; const requiredWrap=node("div",undefined,"inline-check"); requiredWrap.append(requiredInput,requiredLabel); checks.append(caseWrap,requiredWrap); options.append(checks); advanced.append(options); content.append(advanced); row.append(content);
      const remove=node("button","×","remove-extraction"); remove.type="button"; remove.onclick=()=>{ row.remove(); renumberWebhookFields(); editorDirty=true; }; row.append(remove); container.append(row);
      if (preset.startAfter!==undefined||preset.endBefore!==undefined||preset.defaultValue!==undefined||preset.maxCharacters!==undefined||preset.occurrence!==undefined||preset.caseSensitive===true||preset.required===true) advanced.open=true;
      renderWebhookSourceFields(row,preset); key.oninput=()=>{ updateClientIdentityOptions(); editorDirty=true; }; source.onchange=()=>{ renderWebhookSourceFields(row); editorDirty=true; }; renumberWebhookFields(); return row;
    }
    function updateClientLinkageFields() {
      const isWebhook=byId("actionType").value==="forward_webhook"; const linked=isWebhook&&Boolean(byId("clientIdentityField").value); byId("webhookClientLinkage").classList.toggle("hidden",!isWebhook); byId("clientIdentityField").disabled=!isWebhook; byId("clientAliasScopeGroup").classList.toggle("hidden",!linked); byId("clientAliasScope").disabled=!linked; byId("clientAliasScope").required=linked;
    }
    function updateGoreloAssignmentControls(resetUnavailable=false) {
      const ticket=byId("actionType").value==="create_ticket"; const fixedClient=ticket&&byId("goreloClientMode").value==="fixed";
      goreloAssignmentDefinitions.forEach((definition)=>{
        const mode=byId(definition.modeId); const fixedOption=[...mode.options].find((option)=>option.value==="fixed"); const fixedAvailable=!definition.fixedNeedsClient||fixedClient; if (fixedOption) fixedOption.disabled=!fixedAvailable;
        if (resetUnavailable&&mode.value==="fixed"&&!fixedAvailable) mode.value="none";
        const value=ticket?mode.value:"none"; const fixed=value==="fixed"; const extracted=value==="extracted"; const fixedGroup=byId(definition.fixedGroupId); const fixedControl=byId(definition.fixedId); const resolverGroup=byId(definition.resolverGroupId); const resolverField=byId(definition.resolverFieldId); const resolverMatch=byId(definition.resolverMatchId);
        mode.disabled=!ticket; fixedGroup.classList.toggle("hidden",!fixed); resolverGroup.classList.toggle("hidden",!extracted); fixedControl.disabled=!ticket||!fixed||!fixedAvailable; resolverField.disabled=!ticket||!extracted; resolverField.required=ticket&&extracted; resolverMatch.disabled=!ticket||!extracted; resolverMatch.required=ticket&&extracted;
      });
    }
    function updateGoreloClientLinkage() {
      const active=isGoreloActionType(); const fixed=active&&byId("goreloClientMode").value==="fixed"; const extracted=active&&!fixed;
      byId("goreloClientLinkage").classList.toggle("hidden",!active); byId("goreloFixedClientGroup").classList.toggle("hidden",!fixed); byId("goreloIdentityFieldGroup").classList.toggle("hidden",!extracted); byId("goreloAliasScopeGroup").classList.toggle("hidden",!extracted);
      byId("goreloClientMode").disabled=!active; byId("goreloClientId").disabled=!fixed; byId("goreloClientId").required=fixed; byId("goreloClientIdentityField").disabled=!extracted; byId("goreloClientIdentityField").required=extracted; byId("goreloClientAliasScope").disabled=!extracted; byId("goreloClientAliasScope").required=extracted;
      const clientSpecific=fixed&&byId("actionType").value==="create_ticket"; ["ticketLocationId","ticketCcContactIds"].forEach((id)=>{ byId(id).disabled=!clientSpecific; }); updateGoreloAssignmentControls();
    }
    function goreloTemplateTarget() {
      const ids=byId("actionType").value==="create_ticket"?["ticketTitleTemplate","ticketDescriptionTemplate","ticketCreatedByTemplate"]:byId("actionType").value==="create_alert"?["alertNameTemplate","alertResourceTemplate","alertDescriptionTemplate"]:[]; if (!ids.length) return null; if (lastGoreloTemplateTarget&&ids.includes(lastGoreloTemplateTarget.id)) return lastGoreloTemplateTarget; return byId(ids[0]);
    }
    function insertGoreloVariable(key) {
      const target=goreloTemplateTarget(); if (!target||target.disabled) return; const value="{{"+key+"}}"; const start=Number.isInteger(target.selectionStart)?target.selectionStart:target.value.length; const end=Number.isInteger(target.selectionEnd)?target.selectionEnd:start; if (target.value.length-(end-start)+value.length>target.maxLength) { showToast("That template is already at its character limit.","error"); return; } target.setRangeText(value,start,end,"end"); lastGoreloTemplateTarget=target; target.dispatchEvent(new Event("input",{bubbles:true})); target.focus(); renderGoreloVariableBar();
    }
    function renderGoreloVariableBar() {
      const chips=byId("goreloVariableChips"); chips.textContent=""; const keys=[]; const seen=new Set(); [...byId("webhookFields").children].forEach((row)=>{ const key=row.querySelector('[data-role="webhook-key"]')?.value.trim(); if (key&&!seen.has(key)&&isSafeTrainerKey(key)) { seen.add(key); keys.push(key); } }); const target=goreloTemplateTarget(); setText("goreloVariableTarget",target?"Inserts into "+goreloTemplateLabels[target.id]+". Assignment mappings are configured below.":"Learned variables are text until mapped to a template or assignment below."); if (!keys.length) { chips.append(node("span","Teach or add an extraction field first.","field-help")); return; } keys.forEach((key)=>{ const button=node("button","{{"+key+"}}","variable-token"); button.type="button"; button.disabled=!target; button.setAttribute("aria-label","Insert {{"+key+"}} into "+(target?goreloTemplateLabels[target.id]:"a Gorelo template")); button.onclick=()=>insertGoreloVariable(key); chips.append(button); });
    }
    function updateClientIdentityOptions(preferred) {
      const select=byId("clientIdentityField"); const wanted=preferred===undefined?select.value:preferred; const keys=[]; const seen=new Set();
      [...byId("webhookFields").children].forEach((row)=>{ const key=row.querySelector('[data-role="webhook-key"]')?.value.trim(); if (key&&!seen.has(key)) { seen.add(key); keys.push(key); } });
      select.textContent=""; const none=node("option","Do not resolve a client"); none.value=""; select.append(none); keys.forEach((key)=>select.append(makeOption(key,key)));
      select.value=keys.includes(wanted)?wanted:""; const goreloSelect=byId("goreloClientIdentityField"); populateGoreloIdentityOptions(goreloSelect.value||goreloActionPreferences?.clientIdentityField||""); updateClientLinkageFields(); updateGoreloClientLinkage(); renderGoreloVariableBar();
    }
    function readWebhookField(row,index) {
      const key=row.querySelector('[data-role="webhook-key"]').value.trim(); if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) throw new Error("Extraction field "+index+" needs a safe key beginning with a letter or underscore.");
      if (!isSafeTrainerKey(key)) throw new Error("Extraction field "+index+" uses a reserved or credential-shaped key.");
      const source=row.querySelector('[data-role="webhook-source"]').value; if (!webhookExtractionSourceSet.has(source)) throw new Error("Extraction field "+index+" has an invalid source."); const result={key,source};
      if (source==="header") { const headerName=row.querySelector('[data-role="webhook-header-name"]').value.trim(); const validHeader=headerName.length>=1&&headerName.length<=128&&[...headerName].every((character)=>/^[!#$%&'*+.^_|~0-9A-Za-z-]$/.test(character)||character.charCodeAt(0)===96); if (!validHeader) throw new Error("Extraction field "+index+" needs a valid header name."); result.headerName=headerName; }
      if (source==="literal") { const value=row.querySelector('[data-role="webhook-literal-value"]').value; if (value.length>4000||/[\u0000-\u001f\u007f]/.test(value)) throw new Error("Extraction field "+index+" needs a safe fixed value."); result.value=value; }
      const startAfter=row.querySelector('[data-role="webhook-start-after"]').value; const endBefore=row.querySelector('[data-role="webhook-end-before"]').value; const fallback=row.querySelector('[data-role="webhook-default"]').value; const maximum=row.querySelector('[data-role="webhook-max-characters"]').value; const occurrence=row.querySelector('[data-role="webhook-occurrence"]').value;
      if (startAfter) { if (startAfter.length>256||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(startAfter)) throw new Error("Extraction field "+index+" has an invalid start marker."); result.startAfter=startAfter; }
      if (endBefore) { if (endBefore.length>256||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(endBefore)) throw new Error("Extraction field "+index+" has an invalid end marker."); result.endBefore=endBefore; }
      if (row.querySelector('[data-role="webhook-case"]').checked) result.caseSensitive=true; if (row.querySelector('[data-role="webhook-required"]').checked) result.required=true;
      if (fallback) { if (fallback.length>4000||/[\u0000-\u001f\u007f]/.test(fallback)) throw new Error("Extraction field "+index+" has an invalid default value."); result.defaultValue=fallback; }
      if (maximum) { const parsed=Number(maximum); if (!Number.isInteger(parsed)||parsed<1||parsed>4000) throw new Error("Extraction field "+index+" maximum must be from 1 to 4000."); result.maxCharacters=parsed; }
      if (occurrence) { const parsed=Number(occurrence); if (!Number.isInteger(parsed)||parsed<1||parsed>1000) throw new Error("Extraction field "+index+" marker occurrence must be from 1 to 1000."); if (!startAfter) throw new Error("Extraction field "+index+" needs a start marker before an occurrence can be selected."); result.occurrence=parsed; }
      return result;
    }
    function readMappedFields(label="Mapped") {
      const rows=[...byId("webhookFields").children]; if (!rows.length||rows.length>50) throw new Error("Add between 1 and 50 extraction fields."); const fields=rows.map((row,index)=>readWebhookField(row,index+1)); const keys=new Set(); fields.forEach((field)=>{ if (keys.has(field.key)) throw new Error(label+" extraction field keys must be unique."); keys.add(field.key); }); return {fields,keys};
    }
    function readTemplate(id,label,maximum,required,keys) {
      const value=byId(id).value; if (required&&!value.length) throw new Error(label+" is required."); if (value.length>maximum||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(label+" exceeds its safe text limit.");
      const references=[]; const remainder=value.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*}}/g,(_placeholder,key)=>{ references.push(key); return ""; }); if (remainder.includes("{{")||remainder.includes("}}")) throw new Error(label+" placeholders must use {{field_name}} syntax."); const unknown=references.find((key)=>!keys.has(key)); if (unknown) throw new Error(label+" references unknown extraction field "+unknown+"."); return value;
    }
    function readPositiveGoreloId(id,label,required=false) {
      const value=byId(id).value; if (!value) { if (required) throw new Error("Select a "+label.toLowerCase()+"."); return undefined; } const parsed=Number(value); if (!Number.isSafeInteger(parsed)||parsed<=0) throw new Error(label+" must be a positive Gorelo ID."); return parsed;
    }
    function readGoreloIdList(id,label) {
      const values=selectedOptionValues(byId(id)); if (values.length>100) throw new Error(label+" supports at most 100 values."); const parsed=values.map((value)=>Number(value)); if (!parsed.every((value)=>Number.isSafeInteger(value)&&value>0)||new Set(parsed).size!==parsed.length) throw new Error(label+" contains an invalid or duplicate Gorelo ID."); return parsed;
    }
    function readGuidList(id,label) {
      const values=selectedOptionValues(byId(id)); if (values.length>100) throw new Error(label+" supports at most 100 values."); if (!values.every((value)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))||new Set(values.map((value)=>value.toLowerCase())).size!==values.length) throw new Error(label+" contains an invalid or duplicate asset ID."); return values;
    }
    function collectGoreloClientLinkage(keys) {
      if (byId("goreloClientMode").value==="fixed") return {clientId:readPositiveGoreloId("goreloClientId","Imported client",true)};
      const clientIdentityField=byId("goreloClientIdentityField").value; if (!keys.has(clientIdentityField)) throw new Error("Choose an existing extraction field for Gorelo client resolution."); const clientAliasScope=byId("goreloClientAliasScope").value.trim()||"global"; if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(clientAliasScope)) throw new Error("Client alias scope must be a safe identifier such as global or vendor-a."); return {clientIdentityField,clientAliasScope};
    }
    function collectGoreloAssignment(action,definition,keys) {
      const mode=byId(definition.modeId).value; if (mode==="none") return;
      if (mode==="fixed") {
        if (definition.fixedNeedsClient&&byId("goreloClientMode").value!=="fixed") throw new Error(definition.label+" can only use a fixed record when the Gorelo client is fixed.");
        if (definition.key==="agentAsset") { const ids=readGuidList(definition.fixedId,definition.label); if (!ids.length) throw new Error("Select at least one fixed managed device."); action[definition.fixedProperty]=ids; }
        else { const id=readPositiveGoreloId(definition.fixedId,definition.label,true); action[definition.fixedProperty]=id; }
        return;
      }
      if (mode!=="extracted") throw new Error("Choose a valid "+definition.label.toLowerCase()+" assignment mode."); const field=byId(definition.resolverFieldId).value; const matchBy=byId(definition.resolverMatchId).value; if (!keys.has(field)) throw new Error("Choose an existing extraction field for "+definition.label.toLowerCase()+" resolution."); if (!definition.matchBy.has(matchBy)) throw new Error("Choose a valid exact match method for "+definition.label.toLowerCase()+" resolution."); action[definition.resolverProperty]={field,matchBy};
    }
    function assertGoreloActionReady(action) {
      if (!action||!goreloActionTypes.has(action.type)) return; if (!setupState?.gorelo?.configured) throw new Error("Configure and verify the Gorelo API in Setup before saving this action.");
      const imported=action.clientId===undefined?undefined:goreloClients.find((client)=>client.id===action.clientId); if (imported?.stale) throw new Error("Choose a current imported Gorelo client. Refresh or import the client directory if it changed.");
    }
    function collectGoreloAction(requireAvailability=true) {
      const type=byId("actionType").value; const {fields,keys}=readMappedFields("Gorelo"); const action={type,bypassSpam:byId("bypassSpam").checked,fields,...collectGoreloClientLinkage(keys)};
      if (type==="create_ticket") {
        action.titleTemplate=readTemplate("ticketTitleTemplate","Ticket title template",998,true,keys); const description=readTemplate("ticketDescriptionTemplate","Ticket description template",16000,false,keys); const createdBy=readTemplate("ticketCreatedByTemplate","Created by name template",320,false,keys); if (description) action.descriptionTemplate=description; if (createdBy) action.createdByNameTemplate=createdBy;
        action.statusId=readPositiveGoreloId("ticketStatusId","Status",true); action.groupId=readPositiveGoreloId("ticketGroupId","Group",true); action.typeId=readPositiveGoreloId("ticketTypeId","Ticket type",true);
        const priority=byId("ticketPriorityId").value; if (priority!=="") { const value=Number(priority); if (!Number.isInteger(value)||value<0||value>4) throw new Error("Ticket priority must be from 0 to 4."); action.priorityId=value; } const source=byId("ticketSourceId").value; if (source!=="") { const value=Number(source); if (!Number.isInteger(value)||value<1||value>6) throw new Error("Ticket source must be from 1 to 6."); action.sourceId=value; }
        if (byId("goreloClientMode").value==="fixed") { const location=readPositiveGoreloId("ticketLocationId","Location"); const cc=readGoreloIdList("ticketCcContactIds","CC contacts"); if (location!==undefined) action.locationId=location; if (cc.length) action.ccContactIds=cc; }
        goreloAssignmentDefinitions.forEach((definition)=>collectGoreloAssignment(action,definition,keys));
        const assisting=readGoreloIdList("ticketAssistingIds","Assisting assignees"); const watchers=readGoreloIdList("ticketWatcherIds","Watchers"); const tags=readGoreloIdList("ticketTagIds","Tags"); if (assisting.length) action.assistingAssigneeIds=assisting; if (watchers.length) action.watcherIds=watchers; if (tags.length) action.tagIds=tags; action.sendTicketCreatedEmail=byId("ticketSendCreatedEmail").checked; action.isUnread=byId("ticketIsUnread").checked;
      } else if (type==="create_alert") {
        action.nameTemplate=readTemplate("alertNameTemplate","Alert name template",998,true,keys); action.resourceTemplate=readTemplate("alertResourceTemplate","Alert resource template",998,true,keys); const description=readTemplate("alertDescriptionTemplate","Alert description template",16000,false,keys); if (description) action.descriptionTemplate=description; const severity=Number(byId("alertSeverity").value); if (!Number.isInteger(severity)||severity<1||severity>4) throw new Error("Alert severity must be from 1 to 4."); action.severity=severity;
      } else throw new Error("Choose a supported Gorelo API action.");
      if (requireAvailability) assertGoreloActionReady(action); return action;
    }
    function populateWebhookDestinationSelect(preferred) {
      const select=byId("ruleWebhookDestination"); const wanted=preferred===undefined?(select.value||webhookActionDestinationPreference):preferred; select.textContent=""; const isAction=byId("actionType").value==="forward_webhook"; let prompt;
      if (webhooksLoading) prompt="Loading registered destinations…"; else if (!webhooksLoaded) prompt="Destinations unavailable"; else if (!webhookCapability?.configured) prompt="Webhook registration is not configured"; else if (!webhookCapability.signingConfigured) prompt="Webhook signing is not configured"; else prompt="Select a registered destination";
      const first=node("option",prompt); first.value=""; select.append(first); webhooks.forEach((webhook)=>{ const option=makeOption(webhook.id,webhook.name+(webhook.enabled?"":" (disabled)")); option.disabled=!webhook.enabled; select.append(option); }); if (webhooks.some((webhook)=>webhook.id===wanted)) select.value=wanted;
      if (select.value) webhookActionDestinationPreference=select.value; const ready=isAction&&webhooksLoaded&&webhookCapability?.configured===true&&webhookCapability.signingConfigured===true; select.disabled=!ready; select.required=isAction;
      const enabled=webhooks.filter((webhook)=>webhook.enabled).length; let status;
      if (webhooksLoading) status="Loading registered webhook destinations…"; else if (!webhooksLoaded) status="Webhook destinations could not be loaded. Refresh after configuring the optional endpoint."; else if (!webhookCapability?.configured) status="Configure the server-side webhook host allow-list before using this action."; else if (!webhookCapability.signingConfigured) status="Configure the webhook signing secret in Cloudflare before using this action."; else status=enabled+" enabled destination"+(enabled===1?"":"s")+" available. Saving this rule does not send test traffic.";
      setText("webhookActionAvailability",status);
    }
    async function ensureWebhookActionDestinations(force=false) {
      populateWebhookDestinationSelect(); if (force||(!webhooksLoaded&&!webhooksLoading)) await loadWebhooks(force); populateWebhookDestinationSelect();
    }
    function assertWebhookActionReady(action) {
      if (action?.type!=="forward_webhook") return;
      if (!Array.isArray(action.fields)||action.fields.length<1||action.fields.length>50) throw new Error("Add between 1 and 50 webhook extraction fields.");
      if (!webhooksLoaded||!webhookCapability?.configured||!webhookCapability.signingConfigured) throw new Error("Configure webhook registration and signing, then refresh destinations before saving this action.");
      const registered=webhooks.find((webhook)=>webhook.id===action.webhookDestinationId); if (!registered||!registered.enabled) throw new Error("Select an enabled registered webhook destination.");
    }
    function collectWebhookAction(requireAvailability=true) {
      const webhookDestinationId=byId("ruleWebhookDestination").value||webhookActionDestinationPreference; if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(webhookDestinationId)) throw new Error("Select a valid registered webhook destination.");
      const eventType=byId("webhookEventType").value.trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(eventType)) throw new Error("Event type must be a safe identifier such as mail.parsed.");
      const {fields,keys}=readMappedFields("Webhook");
      const action={type:"forward_webhook",bypassSpam:byId("bypassSpam").checked,webhookDestinationId,eventType,fields}; const clientIdentityField=byId("clientIdentityField").value;
      if (clientIdentityField) { if (!keys.has(clientIdentityField)) throw new Error("Choose an existing extraction field for Gorelo client resolution."); const clientAliasScope=byId("clientAliasScope").value.trim()||"global"; if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(clientAliasScope)) throw new Error("Client alias scope must be a safe identifier such as global or vendor-a."); action.clientIdentityField=clientIdentityField; action.clientAliasScope=clientAliasScope; }
      if (requireAvailability) assertWebhookActionReady(action);
      return action;
    }
    function populateGoreloActionForm(action) {
      const direct=goreloActionTypes.has(action.type); ["goreloClientId","ticketStatusId","ticketGroupId","ticketTypeId","ticketLocationId","ticketContactId","ticketCcContactIds","ticketLeadAssigneeId","ticketAssistingIds","ticketWatcherIds","ticketTagIds","ticketAgentAssetIds"].forEach((id)=>{ [...byId(id).options].forEach((option)=>{ option.selected=false; }); }); goreloActionPreferences=direct?action:null; byId("goreloClientMode").value=direct&&action.clientIdentityField?"extracted":"fixed"; byId("goreloClientAliasScope").value=direct?action.clientAliasScope||"global":"global";
      goreloAssignmentDefinitions.forEach((definition)=>{ const resolver=direct&&action.type==="create_ticket"?action[definition.resolverProperty]:undefined; const fixed=direct&&action.type==="create_ticket"?action[definition.fixedProperty]:undefined; byId(definition.modeId).value=resolver?"extracted":fixed!==undefined&&(!Array.isArray(fixed)||fixed.length)?"fixed":"none"; byId(definition.resolverMatchId).value=resolver&&definition.matchBy.has(resolver.matchBy)?resolver.matchBy:[...definition.matchBy][0]; });
      byId("ticketTitleTemplate").value=action.type==="create_ticket"?action.titleTemplate||"{{subject}}":"{{subject}}"; byId("ticketDescriptionTemplate").value=action.type==="create_ticket"?action.descriptionTemplate||"":""; byId("ticketCreatedByTemplate").value=action.type==="create_ticket"?action.createdByNameTemplate||"":""; byId("ticketPriorityId").value=action.type==="create_ticket"&&action.priorityId!==undefined?String(action.priorityId):""; byId("ticketSourceId").value=action.type==="create_ticket"&&action.sourceId!==undefined?String(action.sourceId):""; byId("ticketSendCreatedEmail").checked=action.type==="create_ticket"&&action.sendTicketCreatedEmail===true; byId("ticketIsUnread").checked=action.type!=="create_ticket"||action.isUnread!==false;
      byId("alertNameTemplate").value=action.type==="create_alert"?action.nameTemplate||"{{subject}}":"{{subject}}"; byId("alertResourceTemplate").value=action.type==="create_alert"?action.resourceTemplate||"{{resource}}":"{{resource}}"; byId("alertDescriptionTemplate").value=action.type==="create_alert"?action.descriptionTemplate||"":""; byId("alertSeverity").value=action.type==="create_alert"?String(action.severity??3):"3";
      populateGoreloCatalogControls(); populateGoreloIdentityOptions(direct?action.clientIdentityField||"":""); goreloActionPreferences=null; updateGoreloClientLinkage();
    }
    function defaultGoreloFields(type) {
      const defaults=[{key:"subject",source:"subject",required:true,maxCharacters:998}]; if (type==="create_alert") defaults.push({key:"resource",source:"subject",required:true,maxCharacters:998}); else defaults.push({key:"details",source:"body_text",maxCharacters:4000}); return defaults;
    }
    function updateActionFields() {
      const type=byId("actionType").value; const isWebhook=type==="forward_webhook"; const isGorelo=isGoreloActionType(type); const forwards=type==="forward"||isWebhook; const mapped=mappedActionTypes.has(type);
      byId("actionMailboxGroup").classList.toggle("hidden",!forwards); byId("actionMailboxId").disabled=!forwards; byId("quarantineDestinationGroup").classList.toggle("hidden",type!=="quarantine"); byId("quarantineDestination").disabled=type!=="quarantine"; byId("rejectReasonGroup").classList.toggle("hidden",type!=="reject"); byId("rejectReason").disabled=type!=="reject";
      const canBypass=forwards||isGorelo; byId("bypassSpamGroup").classList.toggle("hidden",!canBypass); byId("bypassSpam").disabled=!canBypass; setText("bypassSpamLabel",isWebhook?"Bypass the global spam action when this forward + webhook rule matches":isGorelo?"Bypass the global spam action when this API-only Gorelo rule matches":"Bypass the global spam action when this forward rule matches");
      const webhookConfig=byId("webhookActionConfig"); webhookConfig.classList.toggle("hidden",!isWebhook); webhookConfig.querySelectorAll("input,select,button").forEach((control)=>{ control.disabled=!isWebhook; }); byId("ruleWebhookDestination").required=isWebhook;
      const mappedConfig=byId("mappedActionConfig"); mappedConfig.classList.toggle("hidden",!mapped); mappedConfig.querySelectorAll("input,select,textarea,button").forEach((control)=>{ control.disabled=!mapped; }); setText("extractionHeading",isWebhook?"Extract webhook fields":"Extract Gorelo fields"); setText("extractionDescription",isWebhook?"Teach the parser from an email or add bounded fields manually. Each key becomes a signed JSON value.":"Teach the parser from an email and reuse the learned variables in Gorelo templates. Required values fail safely before any API request.");
      if (mapped&&!byId("webhookFields").children.length) defaultGoreloFields(isGorelo?type:"forward_webhook").forEach(addWebhookFieldRow); renumberWebhookFields(); updateClientLinkageFields(); updateGoreloClientLinkage();
      if (forwards) { populateActionMailboxSelect(byId("actionMailboxId").value); void loadMailboxes(); }
      if (isWebhook) { populateWebhookDestinationSelect(); void ensureWebhookActionDestinations(); } else { byId("ruleWebhookDestination").required=false; }
      const goreloConfig=byId("goreloActionConfig"); goreloConfig.classList.toggle("hidden",!isGorelo); byId("refreshGoreloCatalogs").disabled=!isGorelo; const ticket=type==="create_ticket"; const alert=type==="create_alert"; byId("ticketActionFields").classList.toggle("hidden",!ticket); byId("ticketActionFields").querySelectorAll("input,textarea,select,button").forEach((control)=>{ control.disabled=!ticket; }); byId("alertActionFields").classList.toggle("hidden",!alert); byId("alertActionFields").querySelectorAll("input,textarea,select,button").forEach((control)=>{ control.disabled=!alert; }); updateGoreloClientLinkage();
      if (isGorelo) { populateGoreloCatalogControls(); updateGoreloCatalogStatus(); void ensureGoreloActionCatalogs(); }
      const note=byId("actionNote"); note.classList.toggle("warning",type==="drop"||type==="reject"||(canBypass&&byId("bypassSpam").checked)||(isWebhook&&webhooksLoaded&&(!webhookCapability?.configured||!webhookCapability.signingConfigured))||isGorelo&&!setupState?.gorelo?.configured);
      if (type==="forward") note.textContent=byId("bypassSpam").checked?"Spam bypass is explicit and high impact. Use independently authenticated signals.":"Forwarding preserves the original MIME message and respects the configured spam action.";
      else if (isWebhook) note.textContent=byId("bypassSpam").checked?"Spam bypass applies to both forwarding and webhook delivery. Use independently authenticated match conditions.":"The audit event and webhook ledger are committed first. The original MIME message is then forwarded, and bounded fields are delivered separately in signed JSON.";
      else if (isGorelo) note.textContent=byId("bypassSpam").checked?"Spam bypass is explicit and applies to this API-only action. The email is not forwarded; use independently authenticated match conditions.":"API-only action: the email is not forwarded. A bounded ticket or alert request is prepared from mapped fields and sent to Gorelo once.";
      else if (type==="quarantine") note.textContent=runtimeConfig?.features?.rawQuarantine?"Quarantine retains the original for time-limited review and records a disposition.":"Quarantine forwards the original message to the configured review mailbox; this Worker retains audit metadata only.";
      else if (type==="drop") note.textContent="Drop accepts the SMTP message and discards it without a ticket. Use only for high-confidence blocks."; else note.textContent="Reject returns the configured reason to the sending SMTP server.";
    }
    function populateBuilder(rule) {
      byId("ruleName").value=rule.name||""; byId("ruleDescription").value=rule.description||""; byId("rulePriority").value=String(rule.priority??100); byId("ruleEnabled").checked=rule.enabled!==false; byId("ruleMatch").value=rule.match||"all";
      byId("conditions").textContent=""; (rule.conditions&&rule.conditions.length?rule.conditions:[{field:"subject",operator:"contains",value:"",caseSensitive:false}]).forEach(addConditionRow);
      const action=rule.action||{type:"forward"}; byId("actionType").value=action.type; populateActionMailboxSelect(action.mailboxId||(action.type!=="quarantine"&&action.destination?"legacy:"+action.destination:"")); byId("quarantineDestination").value=action.type==="quarantine"?action.destination||"":""; byId("rejectReason").value=action.reason||"Message rejected by policy"; byId("bypassSpam").checked=Boolean(action.bypassSpam);
      byId("webhookFields").textContent=""; webhookActionDestinationPreference=action.type==="forward_webhook"?action.webhookDestinationId||"":""; byId("webhookEventType").value=action.type==="forward_webhook"?action.eventType||"mail.parsed":"mail.parsed";
      if (mappedActionTypes.has(action.type)) (Array.isArray(action.fields)&&action.fields.length?action.fields:defaultGoreloFields(action.type)).forEach(addWebhookFieldRow);
      byId("clientAliasScope").value=action.type==="forward_webhook"?action.clientAliasScope||"global":"global"; populateGoreloActionForm(action); updateClientIdentityOptions(action.type==="forward_webhook"?action.clientIdentityField||"":""); if (goreloActionTypes.has(action.type)) populateGoreloIdentityOptions(action.clientIdentityField||""); updateActionFields();
    }
    function collectBuilder(requireWebhookAvailability=true) {
      if (!byId("ruleForm").reportValidity()) throw new Error("Complete the required rule fields.");
      const rows=[...byId("conditions").children]; if (!rows.length) throw new Error("Add at least one condition.");
      const priority=Number(byId("rulePriority").value); if (!Number.isInteger(priority)||priority<0||priority>100000) throw new Error("Priority must be a whole number from 0 to 100000.");
      const type=byId("actionType").value; let action;
      if (type === "forward") action={type:"forward",bypassSpam:byId("bypassSpam").checked};
      else if (type === "forward_webhook") action=collectWebhookAction(requireWebhookAvailability);
      else if (goreloActionTypes.has(type)) action=collectGoreloAction(requireWebhookAvailability);
      else if (type === "quarantine") action={type:"quarantine"};
      else if (type === "drop") action={type:"drop"};
      else { const reason=byId("rejectReason").value.trim(); if(!reason) throw new Error("A rejection action needs an SMTP reason."); action={type:"reject",reason}; }
      if (type === "forward" || type === "forward_webhook") { const route=byId("actionMailboxId").value; if (route.startsWith("legacy:")) action.destination=route.slice(7); else if (route) action.mailboxId=route; }
      if (type === "quarantine") { const destination=byId("quarantineDestination").value.trim(); if (destination) action.destination=destination; }
      return {name:byId("ruleName").value.trim(),description:byId("ruleDescription").value.trim(),priority,enabled:byId("ruleEnabled").checked,match:byId("ruleMatch").value,conditions:rows.map(readCondition),action};
    }
    function setEditorMode(mode) {
      clearError("editorError");
      try {
        if (mode === editorMode) return;
        if (mode === "json") byId("ruleJson").value=JSON.stringify(collectBuilder(false),null,2);
        else populateBuilder(JSON.parse(byId("ruleJson").value));
        editorMode=mode;
        const target=mode === "builder" ? byId("ruleName") : byId("ruleJson");
        transitionUi(()=>{ byId("ruleForm").classList.toggle("hidden",mode!=="builder"); byId("jsonEditor").classList.toggle("hidden",mode!=="json"); byId("builderMode").setAttribute("aria-pressed",String(mode==="builder")); byId("jsonMode").setAttribute("aria-pressed",String(mode==="json")); }).then(()=>{ if (editorMode===mode) target.focus(); });
      } catch(error) { showError("editorError",error); }
    }
    function confirmDiscard() { return !editorDirty || confirm("Discard the unsaved rule changes?"); }
    function openEditor(rule,invoker,options={}) {
      if (!byId("editorCard").classList.contains("hidden") && !confirmDiscard()) return;
      const existing=Boolean(rule?.id); editingId=existing?rule.id:null; editorReturnFocus=invoker||document.activeElement; editorMode="builder"; lastGoreloTemplateTarget=null;
      const input=deepCopy(rule?(existing?editable(rule):rule):templates[byId("template").value]); populateBuilder(input); byId("ruleJson").value=JSON.stringify(input,null,2);
      byId("editorTitle").textContent=existing?"Edit “"+rule.name+"”":options.generated?"Create parser rule from email":"Create a routing rule"; byId("generatedDraftBanner").classList.toggle("hidden",!options.generated); setText("loadAuditSample",options.generated?"Load another audit sample":"Load from audit");
      byId("builderMode").setAttribute("aria-pressed","true"); byId("jsonMode").setAttribute("aria-pressed","false"); byId("ruleForm").classList.remove("hidden"); byId("jsonEditor").classList.add("hidden"); clearError("editorError"); editorDirty=Boolean(options.generated);
      byId("workspace").classList.add("editor-active"); byId("editorCard").classList.remove("hidden"); byId("editorTitle").focus(); byId("editorCard").scrollIntoView({block:"start"});
    }
    async function openAuditSamplePicker(invoker) {
      const button=invoker||document.activeElement; if (button instanceof HTMLButtonElement) setBusy(button,true,"Loading…");
      try {
        if (!eventsCache.length) await loadEvents();
        const events=eventsCache.slice(0,100);
        const dialog=document.createElement("dialog"); dialog.className="command-dialog";
        const shell=node("div",undefined,"command-shell"); const heading=node("div",undefined,"dialog-header"); heading.append(node("h3","Use an audited message","dialog-title"),node("p","Choose a received email or webhook. Gorelo Router will load the original sample into the matching rule builder so you can preview and refine it before saving.","muted"));
        const list=node("div",undefined,"command-list");
        if (!events.length) list.append(emptyState("AU","No audit samples yet","Send an email or webhook first, then refresh the audit."));
        events.forEach((event)=>{
          const isWebhook=event.ingress?.type==="webhook"; const row=node("div",undefined,"command-item"); const copy=node("div"); copy.append(node("strong",isWebhook?"Webhook · "+(event.ingress?.sourceName||"received"):event.subject||"Email without subject"),node("span",(event.envelopeFrom||"Unknown sender")+" → "+(event.envelopeTo||event.ingress?.endpoint||"Unknown recipient"),"command-item-copy"),node("span",formatDate(event.createdAt),"command-item-copy")); const actions=node("div",undefined,"command-item-actions"); const use=node("button",isWebhook?"Build webhook rule":"Build email rule","btn btn-primary primary small"); use.type="button"; use.onclick=()=>{ dialog.close(); if (isWebhook) void openWebhookAuditBuilder(event,button); else void openParserRuleFromAudit(event,button); }; actions.append(use); if (!isWebhook) { const dry=node("button","Preview in dry run","btn small"); dry.type="button"; dry.onclick=async()=>{ try { const training=await fetchTrainingSample(eventKey(event)); const sample=training.sample; byId("testFrom").value=sample.from||event.envelopeFrom||""; byId("testTo").value=sample.to||event.envelopeTo||""; byId("testSubject").value=sample.subject||event.subject||""; byId("testBody").value=sample.bodyText||""; byId("testRawSize").value=String(event.rawSize||0); byId("testAttachments").value=""; byId("testHeaders").value="{}"; dialog.close(); showTab("test",true); resetTestResult(); showToast("Audit email loaded into dry run"); } catch(error) { showToast(error.message,"error"); } }; actions.append(dry); } row.append(copy,actions); list.append(row);
        });
        const footer=node("div",undefined,"dialog-footer"); const close=node("button","Close","btn small"); close.type="button"; close.onclick=()=>dialog.close(); footer.append(close); shell.append(heading,list,footer); dialog.append(shell); document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove(),{once:true}); dialog.showModal();
      } catch(error) { showToast(error.message,"error"); }
      finally { if (button instanceof HTMLButtonElement&&document.contains(button)) setBusy(button,false,""); }
    }
    function closeEditor(force,restore=true) {
      if (!force && !confirmDiscard()) return false;
      if (byId("templateTrainerDialog").open) closeTemplateTrainer(true,false);
      byId("workspace").classList.remove("editor-active"); byId("editorCard").classList.add("hidden"); byId("generatedDraftBanner").classList.add("hidden"); editorDirty=false; editingId=null; lastGoreloTemplateTarget=null;
      if (restore && editorReturnFocus && document.contains(editorReturnFocus)) editorReturnFocus.focus();
      return true;
    }
    async function saveRule() {
      clearError("editorError");
      try {
        const input=editorMode === "json" ? JSON.parse(byId("ruleJson").value) : collectBuilder(); assertWebhookActionReady(input&&input.action); assertGoreloActionReady(input&&input.action);
        await runBusy(byId("saveRule"),"Saving…",async() => {
          const path=editingId?"/api/v1/rules/"+encodeURIComponent(editingId):"/api/v1/rules";
          await api(path,{method:editingId?"PUT":"POST",body:JSON.stringify(input)});
        });
        const message=editingId?"Rule updated":"Rule created"; editorDirty=false; closeEditor(true,false); await loadRules(); byId("newRule").focus(); showToast(message);
      } catch(error) { showError("editorError",error); showToast(error.message,"error"); }
    }

    function eventDetail(label,value) {
      const wrap=node("div",undefined,"detail-item");
      const display=value===undefined||value===null||value===""?"—":String(value);
      wrap.append(node("span",label,"detail-label"),node("span",display,"detail-value"));
      return wrap;
    }
    function reviewSection(title) {
      const section=node("section",undefined,"review-section"); section.append(node("h4",title)); return section;
    }
    function reasonText(reason) {
      if (typeof reason === "string") return reason;
      if (!reason) return "Unknown signal";
      const label=reason.label||reason.reason||reason.code||"Spam signal";
      return reason.points===undefined?String(label):String(label)+" ("+(Number(reason.points)>0?"+":"")+reason.points+")";
    }
    function headerEntries(headers) {
      if (!headers) return [];
      if (Array.isArray(headers)) return headers.map((entry)=>Array.isArray(entry)?entry:[entry.name||"Header",entry.value||""]);
      return Object.entries(headers);
    }
    function auditObject(value) { return value!==null&&typeof value==="object"&&!Array.isArray(value); }
    const goreloEntityResolutionMetadata = {
      contact:{label:"Customer contact",matchBy:new Set(["email","alias","name","id"]),id:(value)=>Number.isSafeInteger(value)&&value>0},
      agentAsset:{label:"Managed device",matchBy:new Set(["id","serial_number","name"]),id:(value)=>typeof value==="string"&&(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)||/^[1-9][0-9]{0,18}$/.test(value))},
      leadAssignee:{label:"Gorelo technician",matchBy:new Set(["email","name","id"]),id:(value)=>Number.isSafeInteger(value)&&value>0}
    };
    const goreloEntityResolutionFailureLabels = {not_found:"No exact match",ambiguous:"Ambiguous exact match",invalid:"Invalid extracted value",catalog_unavailable:"Catalog unavailable"};
    function safeGoreloEntityResolution(kind,value) {
      const metadata=goreloEntityResolutionMetadata[kind]; if (!metadata||!auditObject(value)) return {status:"unavailable"}; const matchedBy=metadata.matchBy.has(value.matchedBy)?value.matchedBy:null;
      if (value.status==="resolved"&&metadata.id(value.id)&&typeof value.name==="string"&&value.name.length>=1&&value.name.length<=512&&matchedBy) return {status:"resolved",id:value.id,name:value.name,matchedBy};
      if (Object.hasOwn(goreloEntityResolutionFailureLabels,value.status)&&matchedBy) return {status:value.status,matchedBy}; return {status:"unavailable"};
    }
    function validGoreloEntityResolutions(value) {
      if (value===undefined) return true; if (!auditObject(value)||!Object.keys(value).every((key)=>Object.hasOwn(goreloEntityResolutionMetadata,key)||key==="location")) return false;
      for (const kind of Object.keys(goreloEntityResolutionMetadata)) { if (value[kind]!==undefined&&safeGoreloEntityResolution(kind,value[kind]).status==="unavailable") return false; }
      if (value.location!==undefined) { const location=value.location; if (!auditObject(location)) return false; const derived=location.status==="derived"&&Number.isSafeInteger(location.id)&&location.id>0&&new Set(["contact","agent_asset","entities"]).has(location.source); const failed=new Set(["conflict","not_found","catalog_unavailable"]).has(location.status)&&location.matchedBy==="entity_locations"; if (!derived&&!failed) return false; }
      return true;
    }
    function appendGoreloEntityResolutions(data,container) {
      const resolutions=auditObject(data?.entityResolutions)?data.entityResolutions:null; if (!resolutions) return;
      const entries=Object.keys(goreloEntityResolutionMetadata).filter((kind)=>Object.hasOwn(resolutions,kind)); const hasLocation=Object.hasOwn(resolutions,"location"); if (!entries.length&&!hasLocation) return;
      const section=node("div",undefined,"delivery-subsection"); section.append(node("h6","Assignments & associations"));
      entries.forEach((kind)=>{ const metadata=goreloEntityResolutionMetadata[kind]; const resolution=safeGoreloEntityResolution(kind,resolutions[kind]); const grid=node("div",undefined,"review-detail-grid"); grid.append(eventDetail("Association",metadata.label)); if (resolution.status==="resolved") grid.append(eventDetail("Resolution","Resolved"),eventDetail("Record",resolution.name),eventDetail("Gorelo ID",resolution.id),eventDetail("Matched by",titleCase(resolution.matchedBy))); else grid.append(eventDetail("Resolution",goreloEntityResolutionFailureLabels[resolution.status]||"Resolution details unavailable"),...(resolution.matchedBy?[eventDetail("Matched by",titleCase(resolution.matchedBy))]:[])); section.append(grid); });
      if (hasLocation) { const location=resolutions.location; const derived=auditObject(location)&&location.status==="derived"&&Number.isSafeInteger(location.id)&&location.id>0&&new Set(["contact","agent_asset","entities"]).has(location.source); const failed=auditObject(location)&&new Set(["conflict","not_found","catalog_unavailable"]).has(location.status)&&location.matchedBy==="entity_locations"; const grid=node("div",undefined,"review-detail-grid"); grid.append(eventDetail("Association","Location")); if (derived) grid.append(eventDetail("Resolution","Derived"),eventDetail("Gorelo ID",location.id),eventDetail("Source",location.source==="agent_asset"?"Managed device":titleCase(location.source))); else if (failed) { const labels={conflict:"Resolved entities have conflicting locations",not_found:"No shared entity location",catalog_unavailable:"Location catalog unavailable"}; grid.append(eventDetail("Resolution",labels[location.status])); } else grid.append(eventDetail("Resolution","Resolution details unavailable")); section.append(grid); }
      container.append(section);
    }
    function optionalAuditText(value,maximum) { return value===undefined||(typeof value==="string"&&value.length<=maximum); }
    function validDeliveryAttempt(attempt) {
      return auditObject(attempt)&&Number.isSafeInteger(attempt.attemptNumber)&&attempt.attemptNumber>=1&&deliveryAttemptOutcomes.has(attempt.outcome)&&(attempt.httpStatus===undefined||(Number.isInteger(attempt.httpStatus)&&attempt.httpStatus>=100&&attempt.httpStatus<=599))&&optionalAuditText(attempt.safeError,2000)&&typeof attempt.startedAt==="string"&&attempt.startedAt.length<=100&&typeof attempt.endedAt==="string"&&attempt.endedAt.length<=100;
    }
    function validDeliveryData(data) {
      if (!auditObject(data)) return false; if (data.variables!==undefined) { if (!auditObject(data.variables)) return false; const entries=Object.entries(data.variables); if (entries.length>50||!entries.every(([key,value])=>/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)&&typeof value==="string"&&value.length<=4000)) return false; }
      if (data.goreloClient!==undefined) { const client=data.goreloClient; if (!auditObject(client)||!Number.isSafeInteger(client.id)||client.id<=0||typeof client.name!=="string"||client.name.length>512||typeof client.matchedBy!=="string"||client.matchedBy.length>128) return false; } return validGoreloEntityResolutions(data.entityResolutions);
    }
    function validPositiveAuditId(value) { return Number.isSafeInteger(value)&&value>0; }
    function validPositiveAuditIds(value) { return Array.isArray(value)&&value.length<=100&&value.every(validPositiveAuditId)&&new Set(value).size===value.length; }
    function validAuditGuids(value) { return Array.isArray(value)&&value.length<=100&&value.every((item)=>typeof item==="string"&&(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)||/^[1-9][0-9]{0,18}$/.test(item)))&&new Set(value.map((item)=>item.toLowerCase())).size===value.length; }
    function validAuditUuids(value) { return Array.isArray(value)&&value.length<=100&&value.every((item)=>typeof item==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item))&&new Set(value.map((item)=>item.toLowerCase())).size===value.length; }
    function validGoreloRequest(request,actionType) {
      if (request===null) return true; if (!auditObject(request)) return false;
      if (actionType==="create_alert") { const allowed=new Set(["Name","ClientId","Resource","Severity","Description"]); return Object.keys(request).every((key)=>allowed.has(key))&&typeof request.Name==="string"&&request.Name.length>=1&&request.Name.length<=998&&validPositiveAuditId(request.ClientId)&&typeof request.Resource==="string"&&request.Resource.length>=1&&request.Resource.length<=998&&Number.isInteger(request.Severity)&&request.Severity>=1&&request.Severity<=4&&optionalAuditText(request.Description,16000); }
      const allowed=new Set(["Title","ClientId","StatusId","GroupId","TypeId","CreatedByName","Description","PriorityId","SourceId","LocationId","ContactId","CcContactIds","LeadAssigneeId","AssistingAssigneeIds","WatcherIds","TagIds","AgentAssetIds","CustomAssetIds","UptimeIds","SendTicketCreatedEmail","IsUnread"]); if (!Object.keys(request).every((key)=>allowed.has(key))||typeof request.Title!=="string"||request.Title.length<1||request.Title.length>998||![request.ClientId,request.StatusId,request.GroupId,request.TypeId].every(validPositiveAuditId)||!optionalAuditText(request.CreatedByName,320)||!optionalAuditText(request.Description,16000)||typeof request.SendTicketCreatedEmail!=="boolean"||typeof request.IsUnread!=="boolean") return false;
      if (request.PriorityId!==undefined&&(!Number.isInteger(request.PriorityId)||request.PriorityId<0||request.PriorityId>4)) return false; if (request.SourceId!==undefined&&(!Number.isInteger(request.SourceId)||request.SourceId<1||request.SourceId>6)) return false; if (![request.LocationId,request.ContactId,request.LeadAssigneeId].every((value)=>value===undefined||validPositiveAuditId(value))) return false; if (![request.CcContactIds,request.AssistingAssigneeIds,request.WatcherIds,request.TagIds].every((value)=>value===undefined||validPositiveAuditIds(value))) return false; return (request.AgentAssetIds===undefined||validAuditGuids(request.AgentAssetIds))&&[request.CustomAssetIds,request.UptimeIds].every((value)=>value===undefined||validAuditUuids(value));
    }
    function validDeliveryPayload(snapshot,actionType) {
      if (!auditObject(snapshot)) return false; if (actionType==="create_ticket"||actionType==="create_alert") return snapshot.schemaVersion===1&&(snapshot.region==="aue"||snapshot.region==="usw")&&validGoreloRequest(snapshot.request,actionType)&&validDeliveryData(snapshot.data)&&auditObject(snapshot.data.variables);
      const data=snapshot.data; return data===undefined||validDeliveryData(data);
    }
    function validateAuditDeliveries(value) {
      if (value===undefined) return []; if (!Array.isArray(value)||value.length>100) throw new Error("The Worker returned invalid outbound delivery evidence.");
      value.forEach((delivery)=>{ const object=auditObject(delivery); const validProvider=object&&(delivery.providerId===undefined||(delivery.actionType==="create_ticket"&&typeof delivery.providerId==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(delivery.providerId))); const valid=object&&deliveryActionTypes.has(delivery.actionType)&&deliveryStates.has(delivery.state)&&Number.isSafeInteger(delivery.attemptCount)&&delivery.attemptCount>=0&&delivery.attemptCount<=10000&&typeof delivery.updatedAt==="string"&&delivery.updatedAt.length<=100&&optionalAuditText(delivery.safeError,2000)&&validProvider&&validDeliveryPayload(delivery.payloadSnapshot,delivery.actionType)&&Array.isArray(delivery.attemptHistory)&&delivery.attemptHistory.length<=100&&delivery.attemptHistory.every(validDeliveryAttempt); if (!valid) throw new Error("The Worker returned invalid outbound delivery evidence."); }); return value;
    }
    function deliveryActionLabel(value) {
      if (value==="forward_email") return "Forward email"; if (value==="create_ticket") return "Create Gorelo ticket"; if (value==="create_alert") return "Create Gorelo alert"; return "Send signed webhook";
    }
    function goreloRequestLabel(value) { return value.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/^./,(character)=>character.toUpperCase()); }
    function buildOutboundDeliveries(deliveries) {
      const section=reviewSection("Outbound deliveries");
      if (!deliveries.length) { section.append(node("p","No structured outbound delivery was recorded for this message.","retention-note")); return section; }
      const list=node("div",undefined,"delivery-list");
      deliveries.forEach((delivery)=>{
        const card=node("article",undefined,"delivery-card"); const heading=node("div",undefined,"delivery-heading"); const copy=node("div"); copy.append(node("h5",deliveryActionLabel(delivery.actionType)),node("p","Updated "+formatDate(delivery.updatedAt))); heading.append(copy,node("span",titleCase(delivery.state),"badge "+delivery.state)); card.append(heading);
        const summary=node("div",undefined,"review-detail-grid"); summary.append(eventDetail("Action type",deliveryActionLabel(delivery.actionType)),eventDetail("State",titleCase(delivery.state)),eventDetail("Attempt count",delivery.attemptCount)); if (delivery.providerId) summary.append(eventDetail("Gorelo ticket ID",delivery.providerId)); card.append(summary); if (delivery.safeError) card.append(node("p",delivery.safeError,"delivery-error")); if (delivery.state==="uncertain") card.append(node("p","Manual review required: Gorelo may have accepted this create request. To prevent a duplicate ticket or alert, the router will not retry it automatically. Check Gorelo and the archived original before taking action.","delivery-manual-review"));
        const data=delivery.payloadSnapshot.data; const variables=auditObject(data?.variables)?Object.entries(data.variables).sort(([left],[right])=>left.localeCompare(right)):[];
        if (data?.variables!==undefined) { const values=node("div",undefined,"delivery-subsection"); values.append(node("h6","Extracted variables")); if (variables.length) { const variableList=node("dl",undefined,"variable-list"); variables.forEach(([key,value])=>{ const item=node("div",undefined,"variable-item"); item.append(node("dt",key),node("dd",value)); variableList.append(item); }); values.append(variableList); } else values.append(node("p","No variables were extracted.","retention-note")); card.append(values); }
        if (auditObject(data?.goreloClient)) { const client=data.goreloClient; const linkage=node("div",undefined,"delivery-subsection"); linkage.append(node("h6","Resolved Gorelo client")); const grid=node("div",undefined,"review-detail-grid"); grid.append(eventDetail("Client",client.name),eventDetail("Gorelo ID",client.id),eventDetail("Matched by",titleCase(client.matchedBy))); linkage.append(grid); card.append(linkage); }
        appendGoreloEntityResolutions(data,card);
        if (delivery.actionType==="create_ticket"||delivery.actionType==="create_alert") { const payload=delivery.payloadSnapshot; const requestSection=node("div",undefined,"delivery-subsection"); requestSection.append(node("h6","Prepared Gorelo request")); const metadata=node("div",undefined,"review-detail-grid"); metadata.append(eventDetail("API region",String(payload.region).toUpperCase()),eventDetail("Snapshot schema",payload.schemaVersion)); requestSection.append(metadata); if (payload.request===null) requestSection.append(node("p","No API request was sent because preparation failed before delivery.","retention-note")); else { const requestGrid=node("div",undefined,"review-detail-grid"); Object.entries(payload.request).forEach(([key,value])=>requestGrid.append(eventDetail(goreloRequestLabel(key),Array.isArray(value)?value.join(", "):value))); requestSection.append(requestGrid); } card.append(requestSection); }
        const attempts=node("div",undefined,"delivery-subsection"); attempts.append(node("h6","Attempt history")); if (delivery.attemptHistory.length) { const attemptList=node("ol",undefined,"attempt-list"); delivery.attemptHistory.forEach((attempt)=>{ const item=node("li",undefined,"attempt-item"); const status=attempt.httpStatus===undefined?"No HTTP status":"HTTP "+attempt.httpStatus; item.append(node("strong","Attempt "+attempt.attemptNumber+" · "+titleCase(attempt.outcome)+" · "+status),node("time",formatDate(attempt.startedAt)+" → "+formatDate(attempt.endedAt))); if (attempt.safeError) item.append(node("p",attempt.safeError)); attemptList.append(item); }); attempts.append(attemptList); } else attempts.append(node("p","No delivery attempts have been recorded yet.","retention-note")); card.append(attempts); list.append(card);
      });
      section.append(list); return section;
    }
    // Compatibility marker for the email-only action branch: if (includeDeliveries&&!webhookIngress) { const actions=
    function buildReviewBody(event,includeDeliveries=false) {
      const audit=event.audit||{}; const presentation=auditPresentation(event); const wrap=node("div",undefined,"review-body"); const webhookIngress=event.ingress?.type==="webhook";
      const overview=reviewSection(webhookIngress?"Webhook and routing":"Message and routing");
      const overviewGrid=node("div",undefined,"review-detail-grid");
      overviewGrid.append(
        eventDetail(webhookIngress?"Source":"Envelope sender",webhookIngress?(event.ingress.sourceName||event.envelopeFrom):event.envelopeFrom),eventDetail(webhookIngress?"Endpoint":"Envelope recipient",event.envelopeTo),eventDetail("Received",formatDate(event.createdAt)),
        eventDetail("Decision",presentation.decisionLabel),eventDetail("Action status",presentation.statusLabel),eventDetail(webhookIngress?"Payload size":"Message size",formatBytes(event.rawSize)),
        eventDetail(webhookIngress?"Action template":"Matched rule",event.matchedRuleName||event.matchedRuleId||(webhookIngress?"Source route":"Global/default policy")),eventDetail("Destination",presentation.destinationLabel),eventDetail(webhookIngress?"Idempotency key":"Message ID",event.messageId)
      );
      if (webhookIngress) overviewGrid.append(eventDetail("Event type",event.ingress.eventType||event.subject),eventDetail("Payload SHA-256",event.ingress.payloadDigest||"Not recorded"));
      overview.append(overviewGrid); if (includeDeliveries || webhookIngress) { const actions=node("div",undefined,"review-actions"); if (webhookIngress) { const build=node("button","View JSON / build mappings","btn btn-primary primary small"); build.type="button"; build.onclick=()=>openWebhookAuditBuilder(event,build); actions.append(build); } else { const create=node("button","Create rule from this email","btn btn-primary primary small"); create.type="button"; create.setAttribute("aria-label","Create a parser rule from "+(event.subject||"this audited email")); create.onclick=()=>openParserRuleFromAudit(event,create); actions.append(create); const recheck=node("button","Recheck current rules","btn small"); recheck.type="button"; recheck.onclick=()=>recheckAuditEvent(event,recheck); actions.append(recheck); } if (audit.rawAvailable===true) { const download=node("button",webhookIngress?"Download raw webhook JSON":"Download archived original (.eml)","btn small"); download.type="button"; download.onclick=()=>downloadAuditRaw(event,download); actions.append(download); } if (actions.childNodes.length) overview.append(actions); } wrap.append(overview);

      const analysis=reviewSection("Policy explanation");
      const threshold=audit.spamThreshold??runtimeConfig?.spamThreshold??"—";
      const scoreLine=node("div",undefined,"score-line");
      const scoreCopy=node("div"); scoreCopy.append(node("span","Spam score","detail-label"),node("strong",String(event.spamScore??0)+" / "+threshold,"score-value"));
      scoreLine.append(scoreCopy,node("span",audit.mimeParsed?"MIME inspected":"Envelope and headers only","badge "+(audit.mimeParsed?"enabled":"disabled"))); analysis.append(scoreLine);
      const analysisGrid=node("div",undefined,"review-detail-grid");
      analysisGrid.append(eventDetail("Decision reason",audit.decisionReason||event.error||"No reason recorded"),eventDetail("Body truncated",audit.bodyTruncated?"Yes":"No"),eventDetail("Threshold at decision",threshold));
      analysis.append(analysisGrid);
      const reasons=Array.isArray(event.spamReasons)?event.spamReasons:[];
      if (reasons.length) {
        const list=node("ul",undefined,"reason-list"); reasons.forEach((reason)=>list.append(node("li",reasonText(reason)))); analysis.append(node("p","Score signals","field-label"),list);
      } else analysis.append(node("p","No positive spam signals were recorded for this decision.","retention-note"));
      wrap.append(analysis);

      if (includeDeliveries) wrap.append(buildOutboundDeliveries(Array.isArray(event.deliveries)?event.deliveries:[]));

      const headers=headerEntries(audit.headers);
      if (headers.length) {
        const section=reviewSection("Captured headers"); const list=node("ul",undefined,"header-list");
        headers.forEach(([name,value])=>{ const item=node("li"); item.append(node("strong",String(name)),node("span",String(value))); list.append(item); });
        section.append(list); wrap.append(section);
      }

      const preview=reviewSection(webhookIngress?"Mapped webhook values":"Safe message preview");
      preview.append(node("p",webhookIngress?"The authenticated webhook JSON is retained privately for the audit retention period so you can build mappings and rules from received events. The raw JSON payload and authentication headers are never stored in unrelated audit records.":"Plain text only. Remote images, active HTML, and embedded content are never loaded in this dashboard.","preview-note"));
      if (audit.bodyPreview) preview.append(node("pre",String(audit.bodyPreview),"message-preview"));
      else preview.append(node("p",runtimeConfig?.features?.rawQuarantine?"No text preview was available for this message.":"Message content is not stored in mailbox-forward quarantine mode.","retention-note"));
      wrap.append(preview);

      const attachments=Array.isArray(audit.attachments)?audit.attachments:[];
      const attachmentSection=reviewSection("Attachments");
      if (attachments.length) {
        const list=node("ul",undefined,"attachment-list");
        attachments.forEach((attachment)=>{
          const item=node("li"); const copy=node("span"); copy.append(node("strong",attachment.filename||attachment.name||"Unnamed attachment"),node("span"," · "+(attachment.mimeType||attachment.type||"unknown type"),"muted"));
          item.append(copy,node("span",formatBytes(attachment.size),"muted")); list.append(item);
        });
        attachmentSection.append(node("p","Metadata only · attachments have not been malware scanned by this router.","preview-note"),list);
      } else attachmentSection.append(node("p","No attachment metadata was recorded.","retention-note"));
      wrap.append(attachmentSection);

      if (event.quarantine) {
        const q=event.quarantine; const releaseUncertain=q.state==="releasing"&&Boolean(q.lastError); const retention=reviewSection("Quarantine disposition"); const grid=node("div",undefined,"review-detail-grid");
        grid.append(eventDetail("Review state",quarantineStateLabel(event)),eventDetail("Expires",formatDate(q.expiresAt)),eventDetail("Version",q.version),eventDetail("Reviewed",formatDate(q.reviewedAt)),eventDetail("Reviewer",q.reviewer),eventDetail("Release destination",q.releaseDestination));
        if (q.releaseMessageId) grid.append(eventDetail("Release message ID",q.releaseMessageId));
        retention.append(grid);
        if (q.note) retention.append(node("p","Review note: "+q.note,"retention-note"));
        if (releaseUncertain) retention.append(node("div","Manual review required. Dispatch may have been accepted, so this release cannot be retried automatically.","event-error"));
        if (q.lastError) retention.append(node("div",q.lastError,"event-error"));
        wrap.append(retention);
      }

      const trace=Array.isArray(audit.trace)?audit.trace:[];
      const timelineSection=reviewSection("Processing timeline");
      if (trace.length) {
        const list=node("ol",undefined,"timeline");
        trace.forEach((entry)=>{ const item=node("li"); const copy=node("div"); copy.append(node("strong",titleCase(entry.stage)+" · "+titleCase(entry.outcome)),node("p",entry.detail||"No additional detail")); item.append(copy,node("time",entry.at?formatDate(entry.at):"")); list.append(item); });
        timelineSection.append(list);
      } else timelineSection.append(node("p","A stage-by-stage trace was not retained for this event.","retention-note"));
      wrap.append(timelineSection);
      const reviewTimeline=Array.isArray(event.quarantine?.timeline)?event.quarantine.timeline:[];
      if (reviewTimeline.length) {
        const section=reviewSection("Review activity"); const list=node("ol",undefined,"timeline");
        reviewTimeline.forEach((entry)=>{ const item=node("li"); const copy=node("div"); const actor=entry.actor?" · "+entry.actor:""; copy.append(node("strong",titleCase(entry.action)+actor),node("p",entry.note||entry.detail?.message||"Disposition recorded")); item.append(copy,node("time",formatDate(entry.at))); list.append(item); });
        section.append(list); wrap.append(section);
      }
      return wrap;
    }
    function actionAvailability(event) {
      const q=event.quarantine||{}; const state=q.state||"pending"; const uncertain=state==="releasing"&&Boolean(q.lastError); const actionable=state==="pending"||state==="release_failed";
      const canRelease=Boolean(actionable&&runtimeConfig?.features?.rawQuarantine&&runtimeConfig?.features?.release&&q.rawAvailable);
      return {state,uncertain,actionable,canRelease,canDownload:Boolean(runtimeConfig?.features?.rawQuarantine&&q.rawAvailable)};
    }
    function renderQuarantineDetail(event) {
      const container=byId("quarantineDetail"); container.removeAttribute("aria-busy"); container.textContent="";
      if (!event) { container.append(emptyState("Q","Select a message","Choose a held message to review its decision, content availability, and audit trail.")); return; }
      const availability=actionAvailability(event); const content=node("article",undefined,"review-content");
      const top=node("header",undefined,"review-top"); const title=node("div",undefined,"review-title"); const stateClass=allowedQuarantineClasses.has(availability.state)?availability.state:"pending";
      title.append(node("span",quarantineStateLabel(event),"badge "+stateClass),node("h3",event.subject||"(No subject)"),node("p",(event.envelopeFrom||"Unknown sender")+" → "+(event.envelopeTo||"Unknown recipient"),"muted"));
      const actions=node("div",undefined,"review-actions");
      const recheck=node("button","Recheck current rules","btn small"); recheck.type="button"; recheck.onclick=()=>recheckAuditEvent(event,recheck); actions.append(recheck);
      const release=node("button",availability.canRelease?"Release to Gorelo":availability.state==="released"?"Already released":availability.uncertain?"Manual review required":"Release unavailable here","btn btn-primary primary small"); release.type="button";
      release.disabled=!availability.canRelease; release.setAttribute("aria-label","Release "+(event.subject||"message")+" to Gorelo");
      if (!availability.canRelease) release.title=runtimeConfig?.features?.rawQuarantine?"Automated release is unavailable for this message or deployment.":"Use the configured review mailbox to release this message.";
      release.onclick=(clickEvent)=>openReviewDialog("release",event,clickEvent.currentTarget);
      actions.append(release);
      if (availability.actionable) {
        const dismiss=node("button","Mark as spam","btn small"); dismiss.type="button"; dismiss.setAttribute("aria-label","Mark "+(event.subject||"message")+" as spam"); dismiss.onclick=(clickEvent)=>openReviewDialog("dismiss",event,clickEvent.currentTarget); actions.append(dismiss);
      }
      if (availability.canDownload) { const download=node("button","Download .eml","btn small"); download.type="button"; download.setAttribute("aria-label","Download original message "+(event.subject||"")); download.onclick=()=>downloadRaw(event,download); actions.append(download); }
      top.append(title,actions); content.append(top,buildReviewBody(event)); container.append(content);
    }
    function renderQuarantine() {
      const list=byId("quarantineList"); list.removeAttribute("aria-busy"); list.textContent="";
      const filtered=quarantineCache; const filteredView=Boolean(byId("quarantineSearch").value.trim())||byId("quarantineState").value!=="all"; byId("loadMoreQuarantine").classList.toggle("hidden",!quarantineCursor);
      if (!filtered.length) {
        list.append(emptyState("Q",filteredView?"No matching messages":"Quarantine is clear",filteredView?"Try a broader search or another state.":"Messages held by policy will appear here."));
        selectedQuarantineId=null; renderQuarantineDetail(null); updateSummary(); return;
      }
      const selectedStillVisible=filtered.some((event)=>eventKey(event)===selectedQuarantineId);
      if (!selectedStillVisible) selectedQuarantineId=eventKey(filtered[0]);
      filtered.forEach((event)=>{
        const id=eventKey(event); const stateValue=quarantineState(event); const stateClass=allowedQuarantineClasses.has(stateValue)?stateValue:"pending";
        const item=node("div"); item.setAttribute("role","listitem");
        const button=node("button",undefined,"queue-item"); button.type="button"; button.dataset.eventId=id; button.setAttribute("aria-current",String(id===selectedQuarantineId)); button.setAttribute("aria-label","Review "+(event.subject||"message without subject")+" from "+(event.envelopeFrom||"unknown sender")+", "+quarantineStateLabel(event));
        button.append(node("span",event.subject||"(No subject)","queue-subject"),node("span",quarantineStateLabel(event),"badge "+stateClass),node("span",event.envelopeFrom||"Unknown sender","queue-sender"));
        const meta=node("span",undefined,"queue-meta"); meta.append(node("span","Score "+String(event.spamScore??0)+" / "+String(event.audit?.spamThreshold??runtimeConfig?.spamThreshold??"—")),node("time",formatDate(event.createdAt))); button.append(meta);
        button.onclick=()=>selectQuarantine(event,button); item.append(button); list.append(item);
      });
      const selected=filtered.find((event)=>eventKey(event)===selectedQuarantineId);
      const cached=auditDetailsCache.get(selectedQuarantineId); renderQuarantineDetail(cached||selected);
      if (selected&&!cached) void loadQuarantineDetail(selected);
      updateSummary();
    }
    function selectQuarantine(event,button) {
      selectedQuarantineId=eventKey(event); byId("quarantineList").querySelectorAll(".queue-item").forEach((item)=>item.setAttribute("aria-current",String(item===button)));
      const cached=auditDetailsCache.get(selectedQuarantineId); renderQuarantineDetail(cached||event);
      if (!cached) void loadQuarantineDetail(event);
      if (window.matchMedia("(max-width:700px)").matches) byId("quarantineDetail").scrollIntoView({block:"start"});
    }
    async function loadQuarantineDetail(event) {
      const id=eventKey(event); const container=byId("quarantineDetail"); container.setAttribute("aria-busy","true");
      try {
        const data=await api("/api/v1/quarantine/"+encodeURIComponent(id)); auditDetailsCache.set(id,data.event);
        if (selectedQuarantineId===id) renderQuarantineDetail(data.event);
      } catch(error) {
        container.removeAttribute("aria-busy"); if (selectedQuarantineId===id) { showError("quarantineNotice",error); showToast(error.message,"error"); }
      }
    }
    async function loadQuarantine(preferredId,append=false) {
      if (append&&!quarantineCursor) return; const requestVersion=append?quarantineRequestVersion:++quarantineRequestVersion; const requestedCursor=append?quarantineCursor:null; const container=byId("quarantineList"); clearError("quarantineNotice"); if (!append) loading(container); byId("loadMoreQuarantine").classList.add("hidden");
      try {
        const parameters=new URLSearchParams({state:byId("quarantineState").value,limit:String(RETAINED_MESSAGE_PAGE_SIZE)}); const query=byId("quarantineSearch").value.trim(); if (query) parameters.set("q",query); if (requestedCursor) parameters.set("cursor",requestedCursor);
        const data=await api("/api/v1/quarantine?"+parameters.toString()); if (requestVersion!==quarantineRequestVersion) return; if (!Array.isArray(data.items)) throw new Error("The Worker returned an invalid quarantine page."); quarantineCache=append?mergeEventPages(quarantineCache,data.items):data.items; quarantineCursor=pageCursor(data.nextCursor); quarantineSummary=data.summary||{pending:0,releaseFailed:0,released:0,dismissed:0};
        if (preferredId&&quarantineCache.some((event)=>eventKey(event)===preferredId)) selectedQuarantineId=preferredId;
        lastRefresh=new Date(); renderQuarantine(); renderRuntime();
      } catch(error) {
        if (requestVersion!==quarantineRequestVersion) return; if (append) { renderQuarantine(); showError("quarantineNotice",error); showToast(error.message,"error"); return; } container.removeAttribute("aria-busy"); container.textContent=""; container.append(emptyState("!","Quarantine unavailable",error.message,"Try again",()=>loadQuarantine())); showError("quarantineNotice",error);
      }
    }
    function scheduleQuarantineSearch() { if (quarantineSearchTimer!==null) clearTimeout(quarantineSearchTimer); quarantineSearchTimer=setTimeout(()=>{ quarantineSearchTimer=null; void loadQuarantine(); },250); }
    async function openReviewDialog(action,event) {
      const availability=actionAvailability(event);
      if (action==="release"&&!availability.canRelease) return;
      if (action==="dismiss"&&!availability.actionable) return;
      if (action==="release") await loadMailboxes();
      reviewAction=action; reviewEvent=event; clearError("reviewDialogError"); byId("reviewNote").value="";
      const release=action==="release"; byId("reviewMailboxGroup").classList.toggle("hidden",!release); byId("reviewMailboxId").required=release; populateReviewMailboxSelect();
      setText("reviewDialogTitle",release?"Release to Gorelo?":"Mark as spam?");
      setText("reviewDialogDescription",(event.subject||"Message without subject")+" from "+(event.envelopeFrom||"unknown sender")+(release?" will be replayed to the selected approved destination.":" will leave the active review queue and remain in the audit ledger."));
      const confirmButton=byId("reviewConfirm"); confirmButton.textContent=release?"Release message":"Mark as spam"; confirmButton.className=release?"btn btn-primary primary":"btn danger";
      byId("reviewDialog").showModal(); (release?byId("reviewMailboxId"):byId("reviewNote")).focus();
    }
    async function submitReviewAction() {
      if (!reviewAction||!reviewEvent||!byId("reviewActionForm").reportValidity()) return;
      clearError("reviewDialogError"); const id=eventKey(reviewEvent); const q=reviewEvent.quarantine||{};
      const body={version:Number(q.version||0),note:byId("reviewNote").value.trim()};
      if (reviewAction==="release") body.mailboxId=byId("reviewMailboxId").value;
      const completedAction=reviewAction;
      try {
        await runBusy(byId("reviewConfirm"),reviewAction==="release"?"Releasing…":"Saving…",async()=>{
          const data=await api("/api/v1/quarantine/"+encodeURIComponent(id)+"/"+reviewAction,{method:"POST",body:JSON.stringify(body)}); auditDetailsCache.set(id,data.event);
        });
        byId("reviewDialog").close(); showToast(completedAction==="release"?"Release accepted":"Message marked as spam"); await Promise.all([loadQuarantine(id),loadEvents()]);
      } catch(error) { showError("reviewDialogError",error); showToast(error.message,"error"); }
    }
    async function downloadRaw(event,button) {
      const id=eventKey(event); clearError("quarantineNotice"); setBusy(button,true,"Preparing…");
      try {
        const response=await fetch("/api/v1/quarantine/"+encodeURIComponent(id)+"/raw",{headers:{authorization:"Bearer "+token}});
        if (response.status===401) forceDisconnect("Your admin session expired. Enter the token again.");
        if (!response.ok) { const raw=await response.text(); let data={}; try { data=JSON.parse(raw); } catch {} throw new Error(formatApiError(response,data,raw)); }
        const blob=await response.blob(); const url=URL.createObjectURL(blob); const link=node("a"); const base=(event.subject||"message").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"").slice(0,80)||"message";
        link.href=url; link.download=base+".eml"; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); showToast("Original message download started");
      } catch(error) { showError("quarantineNotice",error); showToast(error.message,"error"); }
      finally { if (document.contains(button)) setBusy(button,false,""); }
    }
    async function downloadAuditRaw(event,button) {
      const id=eventKey(event); clearError("eventsNotice"); setBusy(button,true,"Preparing…");
      try {
        const response=await fetch("/api/v1/events/"+encodeURIComponent(id)+"/raw",{headers:{authorization:"Bearer "+token}});
        if (response.status===401) forceDisconnect("Your admin session expired. Enter the token again.");
        if (!response.ok) { const raw=await response.text(); let data={}; try { data=JSON.parse(raw); } catch {} throw new Error(formatApiError(response,data,raw)); }
        const blob=await response.blob(); const url=URL.createObjectURL(blob); const link=node("a"); const base=(event.subject||"message").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"").slice(0,80)||"message";
        const webhook=event.ingress?.type==="webhook"; link.href=url; link.download=base+".eml"; if (webhook) link.download=base+".json"; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); showToast(webhook?"Raw webhook JSON download started":"Archived original download started");
      } catch(error) { showError("eventsNotice",error); showToast(error.message,"error"); }
      finally { if (document.contains(button)) setBusy(button,false,""); }
    }
    async function recheckAuditEvent(event,button) {
      try {
        await runBusy(button,"Rechecking…",async()=>{
          const result=await api("/api/v1/events/"+encodeURIComponent(eventKey(event))+"/recheck",{method:"POST"});
          const dialog=document.createElement("dialog"); dialog.className="command-dialog";
          const historical=result.historical||{}; const current=result.current||{};
          const esc=(value)=>String(value??"—");
          const header=node("div",undefined,"dialog-header"); header.append(node("h2","Current-policy simulation"),node("p","This re-evaluates the retained audit facts against today’s rules. It does not forward or send anything."));
          const body=node("div",undefined,"dialog-body"); const grid=node("div",undefined,"review-detail-grid");
          [["Historical decision",historical.decision],["Current decision",current.decision],["Historical spam score",historical.spamScore],["Current spam score",current.spamScore],["Current matched rule",current.matchedRuleName||current.matchedRuleId||"Default policy"],["Current destination",current.destination||"No destination"]].forEach(([label,value])=>grid.append(eventDetail(label,esc(value))));
          const facts=result.factsUsed||{}; const factsSection=node("section"); factsSection.append(node("h3","Facts used for matching")); const factsGrid=node("div",undefined,"review-detail-grid"); [["Envelope sender",facts.envelopeFrom],["Sender domain",facts.fromDomain],["Envelope recipient",facts.envelopeTo],["Subject",facts.subject],["Body preview characters",facts.bodyPreviewCharacters]].forEach(([label,value])=>factsGrid.append(eventDetail(label,esc(value)))); factsSection.append(factsGrid); const rulesSection=node("section"); rulesSection.append(node("h3","Rules evaluated from live D1")); const considered=Array.isArray(result.rulesConsidered)?result.rulesConsidered:[]; rulesSection.append(node("p",considered.length+" rule"+(considered.length===1?"":"s")+" loaded at "+esc(result.rulesetEvaluatedAt),"retention-note")); const ruleList=node("ul",undefined,"reason-list"); considered.forEach((rule)=>ruleList.append(node("li",esc(rule.name||rule.id)+" · priority "+esc(rule.priority)+(rule.enabled?" · enabled":" · disabled")))); rulesSection.append(ruleList);
          const preparation=result.goreloPreparation;
          if (preparation&&auditObject(preparation.data)) {
            const prepSection=node("section",undefined,"delivery-subsection"); prepSection.append(node("h3","Gorelo action readiness"));
            const prepData=preparation.data; const resolution=auditObject(prepData.clientResolution)?prepData.clientResolution:null; const variables=auditObject(prepData.variables)?prepData.variables:{};
            const prepGrid=node("div",undefined,"review-detail-grid"); prepGrid.append(eventDetail("Action",preparation.actionType==="create_ticket"?"Create ticket":"Create alert"));
            const identityValue=typeof preparation.clientIdentityValue==="string"?preparation.clientIdentityValue:Object.entries(variables).find(([key])=>key.toLowerCase().includes("business")||key.toLowerCase().includes("client"))?.[1]; if (identityValue!==undefined) prepGrid.append(eventDetail("Extracted client value",identityValue||"(empty)")); if (preparation.clientIdentityField) prepGrid.append(eventDetail("Client identity field",preparation.clientIdentityField));
            if (resolution) { const status=String(resolution.status||"unknown"); prepGrid.append(eventDetail("Client resolution",status==="resolved"?"Resolved":status==="ambiguous"?"Ambiguous":"Not found")); if (resolution.name) prepGrid.append(eventDetail("Resolved Gorelo client",resolution.name)); if (resolution.id!==undefined) prepGrid.append(eventDetail("Gorelo client ID",resolution.id)); if (resolution.matchedBy) prepGrid.append(eventDetail("Matched by",titleCase(resolution.matchedBy))); if (Array.isArray(resolution.candidates)&&resolution.candidates.length) prepGrid.append(eventDetail("Candidates",resolution.candidates.map((candidate)=>candidate.clientName+" (#"+candidate.clientId+")").join(", "))); }
            if (auditObject(prepData.resolverInputs)) Object.entries(prepData.resolverInputs).forEach(([entity,input])=>{ if (!auditObject(input)) return; const value=typeof input.value==="string"&&input.value?input.value:"(empty)"; prepGrid.append(eventDetail(titleCase(entity)+" input",value+" · "+String(input.matchBy||"match")+" via "+String(input.field||"field"))); });
            if (auditObject(prepData.entityResolutions?.contact)) { const contact=prepData.entityResolutions.contact; if (contact.matchedValue) prepGrid.append(eventDetail("Contact extracted email",contact.matchedValue)); if (contact.matchedPrimaryEmail) prepGrid.append(eventDetail("Contact matched primary email",contact.matchedPrimaryEmail)); if (contact.returnedClientId!==undefined) prepGrid.append(eventDetail("Contact returned client ID",contact.returnedClientId)); if (contact.expectedClientId!==undefined) prepGrid.append(eventDetail("Contact expected client ID",contact.expectedClientId)); if (contact.rejectionReason) prepGrid.append(eventDetail("Contact rejection reason",contact.rejectionReason)); }
            if (auditObject(prepData.entityResolutions?.agentAsset)) { const asset=prepData.entityResolutions.agentAsset; if (asset.deviceName) prepGrid.append(eventDetail("Matched device name",asset.deviceName)); if (asset.displayName&&asset.displayName!==asset.deviceName) prepGrid.append(eventDetail("Device display name",asset.displayName)); if (asset.id!==undefined) prepGrid.append(eventDetail("Gorelo device ID",asset.id)); if (asset.returnedClientId!==undefined) prepGrid.append(eventDetail("Device client ID",asset.returnedClientId)); if (asset.expectedClientId!==undefined) prepGrid.append(eventDetail("Device expected client ID",asset.expectedClientId)); if (asset.assetStatus) prepGrid.append(eventDetail("Device status",asset.assetStatus)); if (asset.rejectionReason) prepGrid.append(eventDetail("Device rejection reason",asset.rejectionReason)); }
            prepGrid.append(eventDetail("Preparation",preparation.preflightError?"Blocked: "+preparation.preflightError:"Ready")); prepSection.append(prepGrid); if (preparation.preflightError) { const failedEntities=auditObject(prepData.entityResolutions)?Object.entries(prepData.entityResolutions).filter(([,value])=>auditObject(value)&&value.status!=="resolved").map(([entity,value])=>titleCase(entity)+": "+String(value.status)).join("; "):""; prepSection.append(node("p",failedEntities?"Unresolved Gorelo entities — "+failedEntities+". Correct the displayed input or alias/association and recheck before processing.":preparation.preflightError==="entity_resolution_failed"?"Gorelo could not resolve one or more client, contact, technician, device, or location values. Correct the displayed input or alias/association and recheck before processing.":"The Gorelo action could not be prepared. Review the extracted values and rule mappings before processing.","event-error")); }
            body.append(grid,factsSection,rulesSection,prepSection,node("p",Array.isArray(result.limitations)?result.limitations.join(" · "):"Simulation only","retention-note"));
          } else body.append(grid,factsSection,rulesSection,node("p",Array.isArray(result.limitations)?result.limitations.join(" · "):"Simulation only","retention-note")); const footer=node("div",undefined,"dialog-footer"); const close=node("button","Close","btn btn-primary primary small"); close.type="button"; close.onclick=()=>dialog.close();
          // Keep this action visible for every actionable quarantine result.
          // The server is authoritative about which action types can be
          // reprocessed; hiding it here made API-only Gorelo rules appear to
          // have no available workflow at all.
          if ((event.quarantine && (event.quarantine.state === "pending" || event.quarantine.state === "release_failed")) || historical.decision === "quarantine") {
            const process=node("button","Process with current rules","btn btn-primary primary small"); process.type="button"; process.onclick=async()=>{
              const destination=current.destination ? " It will be sent to "+current.destination+" and marked released." : " The server will validate the selected action and mark it processed if supported.";
              if (!window.confirm("Process this quarantined message using the current rules?"+destination)) return;
              try {
                await runBusy(process,"Processing…",async()=>{
                  const detail=event.quarantine?.version ? event : (await api("/api/v1/quarantine/"+encodeURIComponent(eventKey(event)))).event;
                  const response=await api("/api/v1/quarantine/"+encodeURIComponent(eventKey(event))+"/reprocess",{method:"POST",body:JSON.stringify({version:detail.quarantine.version,note:"Processed with current rules"})});
                  if (response?.processed!==true) throw new Error("The Worker did not confirm processing this message.");
                });
                dialog.close();
                showToast("Message processed with current rules");
                // Refresh both views so the quarantine item immediately shows
                // Released and the audit entry reflects the new disposition.
                await Promise.all([loadQuarantine(),loadEvents()]);
              } catch(error) {
                // Keep the simulation open after an unsupported action or
                // delivery failure so the operator can read the error and act.
                body.append(node("div","Processing failed: "+(error.message||"Unable to process this message"),"event-error"));
                showToast(error.message||"Unable to process this message","error");
              }
            }; footer.append(process);
          }
          footer.append(close); dialog.append(header,body,footer); document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove(),{once:true}); dialog.showModal();
        });
      } catch(error) { showToast(error.message||"Unable to recheck this event","error"); }
    }
    async function openWebhookAuditBuilderLegacy(event,button) {
      setBusy(button,true,"Loading…");
      try {
        const response=await fetch("/api/v1/events/"+encodeURIComponent(eventKey(event))+"/raw",{headers:{authorization:"Bearer "+token}});
        if (!response.ok) { const raw=await response.text(); let data={}; try { data=JSON.parse(raw); } catch {} throw new Error(formatApiError(response,data,raw)); }
        const payload=JSON.parse(await response.text()); const pointers=capturePointers(payload).slice(0,50); const used=new Set(); const dialog=document.createElement("dialog"); const title=node("h3","Webhook received — build mappings"); const pre=node("pre",JSON.stringify(payload,null,2),"capture-preview"); pre.style.maxHeight="360px"; pre.style.overflow="auto"; const info=node("p","Detected "+pointers.length+" scalar fields. Save these paths to the source mapping editor, then rename variables and save the source."); const save=node("button","Load fields into source editor","btn btn-primary primary small"); save.type="button"; save.onclick=async()=>{ const sourceId=event.ingress?.sourceId; try { if(!inboundWebhookSources.length) { const data=await api("/api/v1/inbound-webhook-sources"); inboundWebhookSources=data.sources||[]; } const source=inboundWebhookSources.find((item)=>sourceId?item.id===sourceId:item.name===event.ingress?.sourceName); if(!source) throw new Error("Webhook source is unavailable"); dialog.close(); showTab("setup",true); setTimeout(()=>{ openInboundWebhookSourceForm(source,button); byId("inboundWebhookMappings").value=pointers.map((pointer)=>captureFieldName(pointer,used)+" = "+pointer).join("\n"); },0); } catch(error) { showToast(error.message,"error"); } }; const close=node("button","Close","btn small"); close.type="button"; close.onclick=()=>dialog.close(); dialog.append(title,info,pre,save,close); document.body.append(dialog); dialog.showModal();
        save.onclick=()=>{ const selected=rows.filter((item)=>item.check.checked); if(!selected.length){showToast("Select at least one webhook field for the rule","error");return;} const conditions=selected.map((item)=>({field:"webhook",webhookKey:item.name.value.trim(),operator:"equals",value:item.value===undefined?"":String(item.value),caseSensitive:false})); dialog.close(); setWebhookConditionFields(selected.map((item)=>item.name.value.trim())); byId("conditions").textContent=""; conditions.forEach((condition)=>addConditionRow(condition)); setText("conditionsHeading","Webhook conditions"); const description=byId("conditionsHeading").parentElement?.querySelector("p"); if(description) description.textContent="Match extracted fields from this webhook payload. Example values are loaded from the selected audit event."; showToast(conditions.length+" webhook condition"+(conditions.length===1?"":"s")+" loaded into the rule"); };
      } catch(error) { showToast(error.message,"error"); } finally { if (document.contains(button)) setBusy(button,false,""); }
    }
    function webhookPointerValue(payload,pointer) {
      try {
        const parts=pointer.split("/").slice(1).map((part)=>part.replaceAll("~1","/").replaceAll("~0","~"));
        let value=payload;
        for (const part of parts) { if (value===null||value===undefined) return undefined; value=value[part]; }
        return value;
      } catch { return undefined; }
    }
    // Webhook audit builder: show every detected condition, its JSON path, and the value received.
    async function openWebhookAuditBuilder(event,button) {
      setBusy(button,true,"Loading…");
      try {
        const response=await fetch("/api/v1/events/"+encodeURIComponent(eventKey(event))+"/raw",{headers:{authorization:"Bearer "+token}});
        if (!response.ok) { const raw=await response.text(); let data={}; try { data=JSON.parse(raw); } catch {} throw new Error(formatApiError(response,data,raw)); }
        const payload=JSON.parse(await response.text()); const pointers=capturePointers(payload).slice(0,50); const used=new Set(); const dialog=document.createElement("dialog"); dialog.className="webhook-audit-dialog"; const shell=node("div",undefined,"webhook-audit-shell");
        const heading=node("div",undefined,"dialog-header"); heading.append(node("h3","Build webhook conditions","dialog-title"),node("p","These are the scalar values received in the selected audit event. Choose the fields that should match future webhook requests, then load them into the rule conditions.","muted"));
        const table=node("div",undefined,"webhook-audit-fields"); const rows=[];
        pointers.forEach((pointer)=>{ const key=captureFieldName(pointer,used); const value=webhookPointerValue(payload,pointer); const row=node("div",undefined,"webhook-audit-field"); const check=node("input"); check.type="checkbox"; check.checked=true; check.id="webhook-required-"+rows.length; const label=node("label",undefined,"webhook-audit-required"); label.append(check,node("span","Use in rule")); const name=node("input"); name.value=key; name.maxLength=64; name.setAttribute("aria-label","Webhook field name"); const path=node("code",pointer,"webhook-audit-path"); const example=node("pre",value===undefined?"(missing)":JSON.stringify(value),"webhook-audit-value"); row.append(label,name,path,example); table.append(row); rows.push({row,check,name,pointer,value}); });
        if (!rows.length) table.append(node("p","No scalar JSON values were found in this payload.","retention-note"));
        const info=node("p","Webhook conditions are enforced by the source mappings. The example values are for review only and are not saved with the rule.","webhook-audit-dialog-note"); const footer=node("div",undefined,"dialog-footer"); const save=node("button","Load conditions into source editor","btn btn-primary primary small"); save.type="button"; save.disabled=!rows.length; save.onclick=async()=>{ try { const sourceId=event.ingress?.sourceId; if(!inboundWebhookSources.length) { const data=await api("/api/v1/inbound-webhook-sources"); inboundWebhookSources=data.sources||[]; } const source=inboundWebhookSources.find((item)=>sourceId?item.id===sourceId:item.name===event.ingress?.sourceName); if(!source) throw new Error("Webhook source is unavailable"); const mappings=rows.map((item)=>{ const key=item.name.value.trim(); if(!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) throw new Error("Webhook field names must use letters, numbers, and underscores."); return key+(item.check.checked?"!":"")+" = "+item.pointer; }); dialog.close(); showTab("setup",true); setTimeout(()=>{ openInboundWebhookSourceForm(source,button); byId("inboundWebhookMappings").value=mappings.join("\n"); },0); } catch(error) { showToast(error.message,"error"); } }; const close=node("button","Close","btn small"); close.type="button"; close.onclick=()=>dialog.close(); footer.append(save,close); shell.append(heading,table,info,footer); dialog.append(shell); document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove(),{once:true}); dialog.showModal();
      } catch(error) { showToast(error.message,"error"); } finally { if (document.contains(button)) setBusy(button,false,""); }
    }
    function validTrainingSampleResponse(data,eventId) {
      const sample=data&&data.sample; const body=sample&&sample.body; const statuses=new Set(["complete","truncated","unavailable"]); const sources=new Set(["temporary_capture","retained_original","audit_preview","none"]); const text=(value,maximum)=>typeof value==="string"&&value.length<=maximum;
      if (!sample||sample.eventId!==eventId||!text(sample.from,320)||!text(sample.to,320)||!text(sample.subject,998)||!text(sample.bodyText,50000)||!body||!statuses.has(body.status)||!sources.has(body.source)||(body.expiresAt!==undefined&&!text(body.expiresAt,100))||!text(sample.createdAt,100)||typeof data.canCaptureNext!=="boolean"||!Array.isArray(data.warnings)||!data.warnings.every((warning)=>warning&&text(warning.code,100))) throw new Error("The Worker returned an invalid parser training sample.");
      return {sample,canCaptureNext:data.canCaptureNext,warnings:data.warnings};
    }
    async function fetchTrainingSample(eventId) { return validTrainingSampleResponse(await api("/api/v1/events/"+encodeURIComponent(eventId)+"/training-sample"),eventId); }
    // Final webhook rule-builder entry point. This intentionally never opens Setup.
    async function openWebhookAuditBuilder(event,button) {
      setBusy(button,true,"Loading…");
      try {
        const response=await fetch("/api/v1/events/"+encodeURIComponent(eventKey(event))+"/raw",{headers:{authorization:"Bearer "+token}});
        if (!response.ok) { const raw=await response.text(); let data={}; try { data=JSON.parse(raw); } catch {} throw new Error(formatApiError(response,data,raw)); }
        const payload=JSON.parse(await response.text()); const pointers=capturePointers(payload).slice(0,50); const used=new Set(); const dialog=document.createElement("dialog"); dialog.className="webhook-audit-dialog"; const shell=node("div",undefined,"webhook-audit-shell");
        const heading=node("div",undefined,"dialog-header"); heading.append(node("h3","Use webhook sample in rule","dialog-title"),node("p","Select the fields this rule should match. Their values come from the audited webhook and will be loaded directly into the Conditions section.","muted"));
        const table=node("div",undefined,"webhook-audit-fields"); const rows=[];
        pointers.forEach((pointer)=>{ const key=captureFieldName(pointer,used); const value=webhookPointerValue(payload,pointer); const row=node("div",undefined,"webhook-audit-field"); const check=node("input"); check.type="checkbox"; check.checked=true; const label=node("label",undefined,"webhook-audit-required"); label.append(check,node("span","Use in rule")); const name=node("input"); name.value=key; name.maxLength=64; name.setAttribute("aria-label","Webhook field name"); const path=node("code",pointer,"webhook-audit-path"); const example=node("pre",value===undefined?"(missing)":JSON.stringify(value),"webhook-audit-value"); row.append(label,name,path,example); table.append(row); rows.push({check,name,value}); });
        const footer=node("div",undefined,"dialog-footer"); const apply=node("button","Apply to rule conditions","btn btn-primary primary small"); apply.type="button"; apply.disabled=!rows.length; apply.onclick=()=>{ const selected=rows.filter((item)=>item.check.checked&&/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(item.name.value.trim())); if(!selected.length){showToast("Select at least one valid webhook field","error");return;} const conditions=selected.map((item)=>({field:"webhook",webhookKey:item.name.value.trim(),operator:"equals",value:item.value===undefined?"":String(item.value),caseSensitive:false})); setWebhookConditionFields(selected.map((item)=>item.name.value.trim())); byId("conditions").textContent=""; conditions.forEach((condition)=>addConditionRow(condition)); setText("conditionsHeading","Webhook conditions"); const description=byId("conditionsHeading").parentElement?.querySelector("p"); if(description) description.textContent="Match extracted fields from this webhook payload. Example values are loaded from the selected audit event."; dialog.close(); showToast(conditions.length+" webhook condition"+(conditions.length===1?"":"s")+" loaded"); }; const close=node("button","Cancel","btn small"); close.type="button"; close.onclick=()=>dialog.close(); footer.append(apply,close); shell.append(heading,table,node("p","These values are examples from the audit event and are used to seed exact-match conditions.","webhook-audit-dialog-note"),footer); dialog.append(shell); document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove(),{once:true}); dialog.showModal();
      } catch(error) { showToast(error.message,"error"); } finally { if (document.contains(button)) setBusy(button,false,""); }
    }
    function validParserCapture(capture) {
      const states=new Set(["pending","claimed","captured","cancelled","expired","failed"]); const senderModes=new Set(["any","address","domain"]); const privateKeys=new Set(["objectKey","sampleObjectKey","sha256","sampleSha256","sampleSize","claimEventId"]); const noPrivateKeys=!Object.keys(capture||{}).some((key)=>privateKeys.has(key));
      return noPrivateKeys&&capture&&typeof capture.id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(capture.id)&&states.has(capture.state)&&capture.match&&typeof capture.match.recipient==="string"&&senderModes.has(capture.match.senderMode)&&(capture.match.senderValue===undefined||typeof capture.match.senderValue==="string")&&(capture.match.subjectContains===undefined||typeof capture.match.subjectContains==="string")&&typeof capture.requestedBy==="string"&&typeof capture.waitExpiresAt==="string"&&typeof capture.sampleAvailable==="boolean"&&(capture.sampleExpiresAt===undefined||typeof capture.sampleExpiresAt==="string")&&(capture.capturedEventId===undefined||typeof capture.capturedEventId==="string")&&Number.isSafeInteger(capture.version)&&capture.version>=1&&typeof capture.createdAt==="string"&&typeof capture.updatedAt==="string";
    }
    function parserSampleSourceLabel(source) { if (source==="temporary_capture") return "Temporary capture"; if (source==="retained_original") return "Retained original"; if (source==="audit_preview") return "Audit preview"; return "Envelope only"; }
    function renderParserRuleDialog() {
      const data=parserRuleSample; const sample=data?.sample; const summary=byId("parserSampleSummary"); summary.textContent=""; if (!sample) { summary.append(node("p","Loading audited email…","retention-note")); return; }
      [["From",sample.from||"Unknown sender"],["To",sample.to||"Unknown recipient"],["Subject",sample.subject||"(No subject)"],["Source",parserSampleSourceLabel(sample.body.source)]].forEach(([label,value])=>{ const line=node("div",undefined,"parser-sample-line"); line.append(node("strong",label),node("span",value)); summary.append(line); });
      const status=byId("parserBodyStatus"); status.classList.toggle("warning",sample.body.status!=="complete"); if (sample.body.status==="complete") status.textContent="The normalized plain-text body is ready. Continue, then highlight changing values in the parser trainer."; else if (sample.body.status==="truncated") status.textContent="The available body is truncated. You can teach from the visible content or capture the next matching email for a fresh sample."; else status.textContent="This audit has no retained body. Envelope, sender, recipient, and subject can still seed a rule, or you can capture the next matching email.";
      const captureActions=byId("parserCaptureActions"); const mayCapture=data.canCaptureNext&&sample.body.status!=="complete"; captureActions.classList.toggle("hidden",!mayCapture); const captureButton=byId("captureNextEmail"); if (mayCapture) {
        const active=activeParserCapture?.sourceEventId===eventKey(parserRuleEvent||{})?activeParserCapture:null; const captureLocked=Boolean(active&&(active.state==="pending"||active.state==="claimed"||active.state==="captured")); byId("captureSenderMode").disabled=captureLocked; byId("captureSubjectContains").disabled=captureLocked; if (active&&(active.state==="pending"||active.state==="claimed")) { setText("parserCaptureHelp","Waiting for one matching email until "+formatDate(active.waitExpiresAt)+". Normal routing remains active."); captureButton.textContent="Waiting for email…"; captureButton.disabled=true; }
        else if (active?.state==="captured"&&active.sampleAvailable) { setText("parserCaptureHelp","A fresh matching email has been captured and is ready to teach."); captureButton.textContent="Use captured email"; captureButton.disabled=false; }
        else { setText("parserCaptureHelp",sample.body.status==="truncated"?"Capture one fresh matching email for up to 15 minutes. The sample is deleted within one hour.":"Wait up to 15 minutes for one matching email. Its plain text is retained for at most one hour."); captureButton.textContent="Capture next matching email"; captureButton.disabled=false; }
      }
      const outcome=byId("parserRuleForm").elements.parserOutcome.value; const forwards=outcome==="forward"||outcome==="forward_webhook"; byId("parserMailboxGroup").classList.toggle("hidden",!forwards); byId("parserMailboxId").disabled=!forwards; if (forwards) populateParserMailboxSelect();
      clearError("parserRuleError");
    }
    async function openParserRuleFromAudit(event,invoker) {
      const button=invoker||document.activeElement; clearError("eventsNotice"); if (button instanceof HTMLButtonElement) setBusy(button,true,"Loading sample…");
      try { await Promise.allSettled([loadMailboxes(),loadWebhooks()]); const training=await fetchTrainingSample(eventKey(event)); parserRuleEvent=event; parserRuleSample=training; parserRuleInvoker=button; parserRuleRestoreFocus=true; byId("parserRuleForm").elements.parserOutcome.value="forward"; populateParserMailboxSelect(""); resetParserCaptureOptions(training.sample); renderParserRuleDialog(); if (!byId("parserRuleDialog").open) byId("parserRuleDialog").showModal(); byId("continueParserRule").focus(); }
      catch(error) { showError("eventsNotice",error); showToast(error.message,"error"); }
      finally { if (button instanceof HTMLButtonElement&&document.contains(button)) setBusy(button,false,""); }
    }
    function closeParserRuleDialog(restore=true) { parserRuleRestoreFocus=restore; if (byId("parserRuleDialog").open) byId("parserRuleDialog").close(); }
    function resetParserCaptureOptions(sample) { const sender=String(sample?.from||"").trim().toLowerCase(); byId("captureSenderMode").value=sender?"address":"any"; byId("captureSubjectContains").value=""; byId("captureSenderMode").disabled=false; byId("captureSubjectContains").disabled=false; }
    function stopCapturePoll() { captureRequestVersion+=1; if (capturePollTimer!==null) clearTimeout(capturePollTimer); capturePollTimer=null; }
    function scheduleCapturePoll() { if (!activeParserCapture||!(activeParserCapture.state==="pending"||activeParserCapture.state==="claimed")||!token) return; if (capturePollTimer!==null) clearTimeout(capturePollTimer); const version=captureRequestVersion; capturePollTimer=setTimeout(()=>{ capturePollTimer=null; if (version===captureRequestVersion) void pollParserCapture(); },3000); }
    function renderCaptureBanner() {
      const banner=byId("captureBanner"); banner.textContent=""; const capture=activeParserCapture; if (!capture) { banner.classList.add("hidden"); return; } banner.classList.remove("hidden"); banner.classList.toggle("warning",capture.state==="failed"||capture.state==="expired"); const copy=node("div",undefined,"capture-banner-copy"); const actions=node("div",undefined,"capture-banner-actions");
      if (capture.state==="pending"||capture.state==="claimed") { copy.append(node("strong",capture.state==="claimed"?"Matching email received — preparing sample":"Waiting for a parser sample"),node("span",capture.match.recipient+" · "+(capture.match.senderMode==="any"?"any sender":capture.match.senderMode+" "+capture.match.senderValue)+" · expires "+formatDate(capture.waitExpiresAt))); const cancel=node("button","Cancel capture","btn small"); cancel.type="button"; cancel.onclick=()=>cancelActiveParserCapture(cancel); actions.append(cancel); }
      else if (capture.state==="captured"&&capture.sampleAvailable&&capture.capturedEventId) { copy.append(node("strong","Parser sample captured"),node("span","The normalized plain-text sample is available until "+formatDate(capture.sampleExpiresAt)+". Normal routing was unchanged.")); const teach=node("button","Create rule from captured email","btn btn-primary primary small"); teach.type="button"; teach.onclick=()=>teachFromCapturedEmail(teach); const hide=node("button","Hide","btn small"); hide.type="button"; hide.onclick=()=>{ activeParserCapture=null; renderCaptureBanner(); renderParserRuleDialog(); }; actions.append(teach,hide); }
      else { const label=capture.state==="cancelled"?"Parser capture cancelled":capture.state==="expired"?"Parser capture expired":"Parser capture unavailable"; copy.append(node("strong",label),node("span",capture.safeErrorCode?"Safe error code: "+capture.safeErrorCode:"No training sample was retained.")); const hide=node("button","Hide","btn small"); hide.type="button"; hide.onclick=()=>{ activeParserCapture=null; renderCaptureBanner(); renderParserRuleDialog(); }; actions.append(hide); }
      banner.append(copy,actions);
    }
    async function loadParserCaptures() {
      try { const data=await api("/api/v1/parser-captures"); if (!Array.isArray(data.captures)||!data.captures.every(validParserCapture)) throw new Error("The Worker returned an invalid parser capture list."); const now=Date.now(); activeParserCapture=data.captures.find((capture)=>capture.state==="pending"||capture.state==="claimed")||data.captures.find((capture)=>capture.state==="captured"&&capture.sampleAvailable&&Date.parse(capture.sampleExpiresAt||"")>now)||null; renderCaptureBanner(); renderParserRuleDialog(); stopCapturePoll(); scheduleCapturePoll(); }
      catch(error) { activeParserCapture=null; renderCaptureBanner(); if (token) showError("eventsNotice",error); }
    }
    async function startParserCapture() {
      const event=parserRuleEvent; const sample=parserRuleSample?.sample; if (!event||!sample||!parserRuleSample.canCaptureNext) return; clearError("parserRuleError"); const sender=String(sample.from||event.envelopeFrom||"").trim().toLowerCase(); const at=sender.lastIndexOf("@"); const domain=at>0?sender.slice(at+1):""; let senderMode=byId("captureSenderMode").value; if (senderMode==="domain"&&!domain) senderMode=sender?"address":"any"; const match={recipient:String(sample.to||event.envelopeTo||"").trim().toLowerCase(),senderMode}; if (senderMode!=="any") match.senderValue=senderMode==="domain"?domain:sender; const subjectContains=byId("captureSubjectContains").value.trim(); if (subjectContains) match.subjectContains=subjectContains;
      try { await runBusy(byId("captureNextEmail"),"Arming capture…",async()=>{ const data=await api("/api/v1/parser-captures",{method:"POST",body:JSON.stringify({sourceEventId:eventKey(event),match,expiresInSeconds:900})}); if (!validParserCapture(data&&data.capture)) throw new Error("The Worker returned an invalid parser capture."); activeParserCapture=data.capture; }); stopCapturePoll(); renderCaptureBanner(); renderParserRuleDialog(); scheduleCapturePoll(); showToast("Capture armed. Send the next representative email within 15 minutes."); }
      catch(error) { if (error&&error.status===409) await loadParserCaptures(); showError("parserRuleError",error); showToast(error.message,"error"); }
    }
    async function pollParserCapture() {
      const capture=activeParserCapture; if (!capture) return; const version=captureRequestVersion;
      try { const data=await api("/api/v1/parser-captures/"+encodeURIComponent(capture.id)); if (version!==captureRequestVersion||!validParserCapture(data&&data.capture)) return; const previous=capture.state; activeParserCapture=data.capture; renderCaptureBanner(); renderParserRuleDialog(); if (data.capture.state==="captured"&&previous!=="captured") showToast("Matching email captured. The parser sample is ready."); scheduleCapturePoll(); }
      catch(error) { if (version!==captureRequestVersion) return; showError("eventsNotice",error); scheduleCapturePoll(); }
    }
    async function cancelActiveParserCapture(button) {
      const capture=activeParserCapture; if (!capture||(capture.state!=="pending"&&capture.state!=="claimed")) return;
      try { await runBusy(button,"Cancelling…",async()=>{ const data=await api("/api/v1/parser-captures/"+encodeURIComponent(capture.id)+"/cancel",{method:"POST",body:JSON.stringify({version:capture.version})}); if (!validParserCapture(data&&data.capture)) throw new Error("The Worker returned an invalid parser capture."); activeParserCapture=data.capture; }); stopCapturePoll(); renderCaptureBanner(); renderParserRuleDialog(); showToast("Parser capture cancelled"); }
      catch(error) { if (error&&error.status===409) await loadParserCaptures(); showError("eventsNotice",error); showToast(error.message,"error"); }
    }
    async function teachFromCapturedEmail(button) {
      const eventId=activeParserCapture?.capturedEventId; if (!eventId) return; clearError("eventsNotice");
      try { await runBusy(button,"Loading…",async()=>{ const [eventData,training]=await Promise.all([api("/api/v1/events/"+encodeURIComponent(eventId)),fetchTrainingSample(eventId)]); if (!auditObject(eventData&&eventData.event)) throw new Error("The Worker returned an invalid captured audit event."); parserRuleEvent=eventData.event; parserRuleSample=training; parserRuleInvoker=button; parserRuleRestoreFocus=true; byId("parserRuleForm").elements.parserOutcome.value="forward"; populateParserMailboxSelect(""); resetParserCaptureOptions(training.sample); renderParserRuleDialog(); if (!byId("parserRuleDialog").open) byId("parserRuleDialog").showModal(); }); }
      catch(error) { showError("eventsNotice",error); showToast(error.message,"error"); }
    }
    function parserRuleConditions(event,sample) {
      const conditions=[]; const recipient=String(sample.to||event.envelopeTo||"").trim().toLowerCase(); if (recipient) conditions.push({field:"to",operator:"equals",value:recipient,caseSensitive:false}); const sender=String(sample.from||event.envelopeFrom||"").trim().toLowerCase(); const at=sender.lastIndexOf("@"); const domain=at>0?sender.slice(at+1):""; if (domain) conditions.push({field:"from_domain",operator:"equals",value:domain,caseSensitive:false}); else if (sender) conditions.push({field:"from",operator:"equals",value:sender,caseSensitive:false}); return conditions.length?conditions:[{field:"subject",operator:"contains",value:String(sample.subject||event.subject||"message").slice(0,512),caseSensitive:false}];
    }
    function parserDraftAction(type) {
      const mailboxId=byId("parserMailboxId").value; if (type==="forward") return {type,bypassSpam:false,...(mailboxId?{mailboxId}:{})}; if (type==="forward_webhook") return {type,bypassSpam:false,...(mailboxId?{mailboxId}:{}),webhookDestinationId:webhooks.find((webhook)=>webhook.enabled)?.id||"",eventType:"mail.parsed",fields:defaultGoreloFields(type)}; if (type==="create_ticket") return {type,bypassSpam:false,fields:defaultGoreloFields(type),titleTemplate:"{{subject}}",descriptionTemplate:"{{details}}",createdByNameTemplate:"Gorelo Router",sendTicketCreatedEmail:false,isUnread:true}; return {type:"create_alert",bypassSpam:false,fields:defaultGoreloFields("create_alert"),nameTemplate:"{{subject}}",resourceTemplate:"{{resource}}",descriptionTemplate:"",severity:3};
    }
    function createParserRuleDraft() {
      if (!parserRuleEvent||!parserRuleSample?.sample) return; const event=parserRuleEvent; const sample=parserRuleSample.sample; const type=byId("parserRuleForm").elements.parserOutcome.value; const cleanSubject=String(sample.subject||event.subject||"matching email").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim(); const draft={name:("Parse "+cleanSubject).slice(0,120),description:"Drafted from audited email received "+formatDate(event.createdAt)+". Review before enabling.",priority:100,enabled:false,match:"all",conditions:parserRuleConditions(event,sample),action:parserDraftAction(type)}; const invoker=parserRuleInvoker; const training=deepCopy(sample); parserRuleRestoreFocus=false; closeParserRuleDialog(false); showTab("rules",false); openEditor(draft,invoker,{generated:true}); if (mappedActionTypes.has(type)) setTimeout(()=>openTemplateTrainer(byId("teachParser"),training),0); else showToast("Disabled forwarding draft created. Review its mailbox and conditions before saving.");
    }
    function renderAuditDetail(container,event) { container.textContent=""; container.append(buildReviewBody(event,true)); }
    async function toggleAuditEvent(event,button,body) {
      const opening=button.getAttribute("aria-expanded")!=="true";
      button.setAttribute("aria-expanded",String(opening)); button.closest(".event-card")?.classList.toggle("open",opening); body.classList.toggle("hidden",!opening); if (!opening) return;
      const id=eventKey(event); const cached=auditDetailsCache.get(id);
      if (cached&&Array.isArray(cached.deliveries)) { renderAuditDetail(body,cached); return; }
      body.textContent=""; body.append(node("p","Loading complete audit…","audit-loading")); body.setAttribute("aria-busy","true");
      try { const data=await api("/api/v1/events/"+encodeURIComponent(id)); if (!auditObject(data&&data.event)) throw new Error("The Worker returned an invalid audit event."); const detailedEvent={...data.event,deliveries:validateAuditDeliveries(data.deliveries)}; auditDetailsCache.set(id,detailedEvent); body.removeAttribute("aria-busy"); renderAuditDetail(body,detailedEvent); }
      catch(error) { body.removeAttribute("aria-busy"); body.textContent=""; body.append(node("div",error.message,"event-error")); showToast(error.message,"error"); }
    }
    function structuredAuditAction(event) {
      const delivery=Array.isArray(event.deliveries)?event.deliveries.find((item)=>item.actionType==="create_ticket"||item.actionType==="create_alert"):undefined; if (delivery) return delivery.actionType;
      const reason=String(event.audit?.decisionReason||"").toLowerCase(); if (reason.startsWith("create gorelo ticket rule matched")) return "create_ticket"; if (reason.startsWith("create gorelo alert rule matched")) return "create_alert"; return null;
    }
    function auditPresentation(event) {
      const actionType=structuredAuditAction(event); const mailboxSnapshot=event.destinationMailboxName?(event.destinationMailboxName+(event.destination?" · "+event.destination:"")):(event.destination||"No destination"); if (!actionType) return {decisionLabel:titleCase(event.decision),statusLabel:titleCase(event.status),actionLabel:titleCase(event.decision),destinationLabel:mailboxSnapshot,badgeClass:allowedStatusClasses.has(event.status)?event.status:"dropped"};
      const ticket=actionType==="create_ticket"; const noun=ticket?"Ticket":"Alert"; const delivery=Array.isArray(event.deliveries)?event.deliveries.find((item)=>item.actionType===actionType):undefined; const states={pending:noun+" queued",delivering:noun+" creation in progress",succeeded:noun+" created",failed:noun+" creation failed",uncertain:noun+" outcome uncertain"}; const statusLabel=delivery?states[delivery.state]:(event.status==="forwarded"?noun+" created":noun+" action needs review"); const badgeClass=delivery?.state||(event.status==="forwarded"?"succeeded":"failed");
      return {decisionLabel:"Create Gorelo "+noun.toLowerCase()+" via API",statusLabel,actionLabel:"Gorelo "+noun.toLowerCase()+" API",destinationLabel:"Gorelo API · original email not forwarded",badgeClass};
    }
    function renderEvents() {
      const container=byId("events"); container.removeAttribute("aria-busy"); container.textContent="";
      const emails=eventsCache.filter((event)=>event.ingress?.type!=="webhook"); const webhooks=eventsCache.filter((event)=>event.ingress?.type==="webhook"); setText("auditEmailCount",String(emails.length)); setText("auditWebhookCount",String(webhooks.length)); const filtered=(auditStream==="webhooks"?webhooks:emails); const filteredView=Boolean(byId("eventSearch").value.trim())||byId("eventStatus").value!=="all"; byId("loadMoreEvents").classList.toggle("hidden",!eventsCursor);
      if (!filtered.length) { container.append(emptyState("AU",filteredView?"No matching audit events":"No audit events recorded",filteredView?"Try a broader search or another status.":"Retained processing evidence will appear here after the first message.")); return; }
      filtered.forEach((event,index)=>{
        const presentation=auditPresentation(event); const card=node("article",undefined,"event-card"); const button=node("button",undefined,"audit-summary"); button.type="button"; button.setAttribute("aria-expanded","false"); button.setAttribute("aria-controls","audit-detail-"+index);
        button.append(node("span",presentation.statusLabel,"badge "+presentation.badgeClass)); const message=node("span",undefined,"event-message"); message.append(node("strong",event.subject||"(No subject)"),node("span",(event.envelopeFrom||"Unknown sender")+" → "+(event.envelopeTo||"Unknown recipient"),"event-route")); button.append(message,node("time",formatDate(event.createdAt),"event-time"));
        const action=node("span",undefined,"event-action"); action.append(node("strong",presentation.actionLabel),node("span",presentation.destinationLabel)); button.append(action); const detail=node("div",undefined,"audit-detail hidden"); detail.id="audit-detail-"+index; button.onclick=()=>toggleAuditEvent(event,button,detail); card.append(button,detail); container.append(card);
      });
      updateSummary();
    }
    async function loadEvents(append=false) {
      if (append&&!eventsCursor) return; const requestVersion=append?eventsRequestVersion:++eventsRequestVersion; const requestedCursor=append?eventsCursor:null; const container=byId("events"); clearError("eventsNotice"); if (!append) loading(container); byId("loadMoreEvents").classList.add("hidden");
      try { const parameters=new URLSearchParams({status:byId("eventStatus").value,limit:String(RETAINED_MESSAGE_PAGE_SIZE)}); const query=byId("eventSearch").value.trim(); if (query) parameters.set("q",query); if (requestedCursor) parameters.set("cursor",requestedCursor); const data=await api("/api/v1/events?"+parameters.toString()); if (requestVersion!==eventsRequestVersion) return; if (!Array.isArray(data.events)) throw new Error("The Worker returned an invalid audit page."); eventsCache=append?mergeEventPages(eventsCache,data.events):data.events; eventsCursor=pageCursor(data.nextCursor); lastRefresh=new Date(); renderEvents(); updateSummary(); }
      catch(error) { if (requestVersion!==eventsRequestVersion) return; if (append) { renderEvents(); showError("eventsNotice",error); showToast(error.message,"error"); return; } container.removeAttribute("aria-busy"); container.textContent=""; container.append(emptyState("!","Audit unavailable",error.message,"Try again",loadEvents)); showError("eventsNotice",error); }
    }
    function scheduleEventSearch() { if (eventSearchTimer!==null) clearTimeout(eventSearchTimer); eventSearchTimer=setTimeout(()=>{ eventSearchTimer=null; void loadEvents(); },250); }
    function setAuditStream(stream) { auditStream=stream==="webhooks"?"webhooks":"emails"; byId("auditEmailsTab").setAttribute("aria-selected",String(auditStream==="emails")); byId("auditWebhooksTab").setAttribute("aria-selected",String(auditStream==="webhooks")); renderEvents(); }

    function setTestResultState(state,busy=false) { const result=byId("testResult"); result.className="test-result "+state; result.setAttribute("aria-busy",busy?"true":"false"); result.textContent=""; return result; }
    function renderTestStatus(state,icon,title,copy,status="") { const result=setTestResultState(state,state==="is-evaluating"); const empty=node("div",undefined,"result-empty"); const mark=node("div",undefined,"result-orb"); mark.setAttribute("aria-hidden","true"); mark.append(iconNode(icon)); empty.append(mark,node("h3",title),node("p",copy)); result.append(empty); setText("testResultStatus",status); }
    function resetTestResult() { renderTestStatus("is-empty","test","No result yet","Complete the message facts and evaluate to see the exact routing decision."); }
    function renderTestEvaluating() { renderTestStatus("is-evaluating","refresh","Evaluating policy","Checking spam signals, routing rules, and prepared actions.","Evaluating the message policy."); }
    function renderTestFailure() { renderTestStatus("has-error","warning","Evaluation failed","Check the message form error, then try again."); }
    function renderGoreloDryRunPreview(result,container) {
      const preview=result.goreloPreview; if (!auditObject(preview)) return; const section=node("section",undefined,"delivery-subsection"); section.append(node("h4","Structured Gorelo preview"),node("p","Non-mutating evaluation: no Gorelo API request was sent, no ticket or alert was created, and the original email was not forwarded.","preview-note"));
      const status=node("div",undefined,"review-detail-grid"); status.append(eventDetail("API action",preview.actionType==="create_ticket"?"Create ticket":"Create alert")); if (preview.preflightError) { const labels={extraction_failed:"Required field extraction failed",client_resolution_failed:"Client resolution failed",entity_resolution_failed:"Assignment or association resolution failed",mapping_failed:"Template mapping failed"}; status.append(eventDetail("Preflight",labels[preview.preflightError]||"Preparation failed")); } else status.append(eventDetail("Preflight","Ready")); section.append(status);
      const data=auditObject(preview.data)?preview.data:{}; if (auditObject(data.goreloClient)) { const client=data.goreloClient; const clientGrid=node("div",undefined,"review-detail-grid"); clientGrid.append(eventDetail("Resolved client",client.name),eventDetail("Gorelo ID",client.id),eventDetail("Matched by",titleCase(client.matchedBy))); section.append(clientGrid); }
      appendGoreloEntityResolutions(data,section);
      if (auditObject(data.variables)) { const details=node("details",undefined,"raw-result"); details.append(node("summary","View extracted variables"),node("pre",JSON.stringify(data.variables,null,2))); section.append(details); }
      if (auditObject(preview.request)) { const request=node("details",undefined,"raw-result"); request.open=true; request.append(node("summary","Prepared credential-free API request"),node("pre",JSON.stringify(preview.request,null,2))); section.append(request); } else section.append(node("p","No API request could be prepared. Correct the preflight issue before enabling this rule.","retention-note")); container.append(section);
    }
    function renderTestResult(result) {
      const decision=result.decision; const goreloAction=decision.gorelo?.action; const container=setTestResultState("has-result"); const outcome=goreloAction?(goreloAction.type==="create_ticket"?"prepare a Gorelo ticket":"prepare a Gorelo alert"):decision.type; setText("testResultStatus","Policy evaluation complete. Policy would "+outcome+".");
      const heading=node("div",undefined,"decision-heading"); const icon=node("div",undefined,"decision-icon "+decision.type); icon.setAttribute("aria-hidden","true"); icon.append(iconNode(goreloAction?"api":decision.type==="forward"?"forward":decision.type==="quarantine"?"quarantine":"reject")); heading.append(icon);
      const copy=node("div"); copy.append(node("h3","Policy would "+outcome)); heading.append(copy); container.append(heading);
      const grid=node("div",undefined,"decision-grid");
      [["Reason",decision.reason],["Destination",goreloAction?"Gorelo API · no email forward":decision.destination||"None"],["Matched rule",decision.matchedRuleName||decision.matchedRuleId||"Global/default policy"],["Spam score",String(decision.spam.score)+(decision.spam.isSpam?" · threshold met":" · below threshold")]].forEach((item)=>{ const row=node("div",undefined,"decision-row"); row.append(node("span",item[0],"detail-label"),node("div",item[1],"detail-value")); grid.append(row); });
      container.append(grid); if (goreloAction) renderGoreloDryRunPreview(result,container); const raw=node("details",undefined,"raw-result"); raw.append(node("summary","View raw evaluation"),node("pre",JSON.stringify(result,null,2))); container.append(raw);
    }
    async function runTest() {
      const button=byId("runTest"); const form=byId("testForm"); if (button.disabled) return; clearError("testError"); if (!form.reportValidity()) { resetTestResult(); return; }
      let headers; try { headers=JSON.parse(byId("testHeaders").value||"{}"); } catch { renderTestFailure(); showError("testError",new Error("Headers must be valid JSON.")); return; }
      const input={from:byId("testFrom").value,to:byId("testTo").value,subject:byId("testSubject").value,bodyText:byId("testBody").value,headers,attachmentNames:byId("testAttachments").value.split(",").map((item)=>item.trim()).filter(Boolean),rawSize:Number(byId("testRawSize").value||0)};
      const requestVersion=++testRequestVersion; const controls=Array.from(form.querySelectorAll("input,textarea")); const readOnlyStates=controls.map((control)=>control.readOnly); const focusedControl=form.contains(document.activeElement)?document.activeElement:null; let completed=false; controls.forEach((control)=>{ control.readOnly=true; }); renderTestEvaluating();
      try { await runBusy(button,"Evaluating…",async()=>{ const result=await api("/api/v1/evaluate",{method:"POST",body:JSON.stringify(input)}); if (requestVersion!==testRequestVersion||!token) return; renderTestResult(result); completed=true; }); if (completed) showToast("Policy evaluation complete"); }
      catch(error) { if (requestVersion!==testRequestVersion||!token) return; renderTestFailure(); showError("testError",error); showToast(error.message,"error"); }
      finally { controls.forEach((control,index)=>{ control.readOnly=readOnlyStates[index]; }); const activeElement=document.activeElement; const focusWasLost=activeElement===document.body||activeElement===document.documentElement; const testTabActive=byId("testTabButton").getAttribute("aria-selected")==="true"&&!byId("testTab").classList.contains("hidden"); if (requestVersion===testRequestVersion&&focusedControl&&focusWasLost&&testTabActive&&!byId("workspace").classList.contains("hidden")) focusedControl.focus(); }
    }

    function parseSetupResponse(data) {
      const setup=data&&data.setup; const gorelo=setup&&setup.gorelo;
      const profiles=new Set(["forward-only","structured-gorelo"]); const statuses=new Set(["ready","optional","missing"]);
      const validChecks=Array.isArray(setup?.checks)&&setup.checks.every((check)=>check&&typeof check.key==="string"&&typeof check.label==="string"&&statuses.has(check.status)&&typeof check.detail==="string");
      const validGorelo=gorelo&&typeof gorelo.configured==="boolean"&&(gorelo.region==="aue"||gorelo.region==="usw")&&typeof gorelo.baseUrl==="string"&&typeof gorelo.secretName==="string"&&typeof gorelo.setupCommand==="string";
      if (!setup||!profiles.has(setup.profile)||typeof setup.ready!=="boolean"||!validChecks||!validGorelo) throw new Error("The Worker returned an invalid setup status.");
      return setup;
    }
    async function fetchSetup() { return parseSetupResponse(await api("/api/v1/setup/status")); }
    function resetSetupView() {
      replaceIcon(byId("setupReadyIcon"),"refresh"); byId("setupReadyIcon").classList.remove("ready");
      setText("setupReadyTitle","Loading setup status"); setText("setupReadyDetail","Checking required Worker bindings and integrations."); setText("setupProfile","—");
      byId("setupChecks").textContent=""; byId("setupChecks").setAttribute("aria-busy","true");
      setText("goreloRegion","—"); setText("goreloSecretName","—"); setText("goreloEndpoint","—"); setText("setupCommand","Loading secure setup command…");
      const badge=byId("goreloConfiguredBadge"); badge.textContent="Checking"; badge.className="setup-state";
      const ingressList=byId("emailIngressDomains"); ingressList.textContent=""; ingressList.append(emptyState("@","Checking inbound domains","Loading configured Cloudflare catch-alls.")); const ingressBadge=byId("emailIngressCount"); ingressBadge.textContent="Checking"; ingressBadge.className="setup-state optional";
      byId("goreloTestResult").classList.add("hidden"); byId("goreloCatalogCounts").textContent=""; byId("copySetupCommand").disabled=true; byId("testGorelo").disabled=true;
      byId("setupContent").removeAttribute("aria-busy"); clearError("setupNotice");
    }
    function renderGoreloTest(result) {
      const container=byId("goreloCatalogCounts"); container.textContent="";
      const entries=Object.entries(result.catalogCounts).sort(([left],[right])=>left.localeCompare(right));
      if (entries.length) entries.forEach(([label,count])=>{ const item=node("div",undefined,"catalog-count"); item.append(node("strong",String(count)),node("span",titleCase(label))); container.append(item); });
      else container.append(node("p","Connected successfully; no catalog counts were returned.","field-help"));
      setText("goreloCheckedAt","Checked "+formatDate(result.checkedAt)); setText("goreloTestEndpoint","Verified endpoint: "+result.baseUrl); byId("goreloTestResult").classList.remove("hidden");
    }
    function renderSetup(setup) {
      const readyIcon=byId("setupReadyIcon"); replaceIcon(readyIcon,setup.ready?"success":"warning"); readyIcon.classList.toggle("ready",setup.ready);
      setText("setupReadyTitle",setup.ready?"Setup is ready":"Setup needs attention");
      setText("setupReadyDetail",setup.ready?"All required checks passed. Mail routing can run with this profile.":"Complete the missing checks before relying on production routing.");
      setText("setupProfile",setup.profile==="structured-gorelo"?"Structured Gorelo":"Forward only");
      const checks=byId("setupChecks"); checks.textContent=""; checks.removeAttribute("aria-busy");
      if (!setup.checks.length) checks.append(emptyState("✓","No setup checks reported","The Worker did not report any deployment checks."));
      setup.checks.forEach((check)=>{
        const row=node("div",undefined,"setup-check"); const icon=node("span",undefined,"setup-check-icon "+check.status); icon.setAttribute("aria-hidden","true"); icon.append(iconNode(check.status==="ready"?"success":check.status==="optional"?"info":"warning"));
        const copy=node("div",undefined,"setup-check-copy"); copy.append(node("strong",check.label),node("span",check.detail));
        row.append(icon,copy,node("span",titleCase(check.status),"setup-state "+check.status)); checks.append(row);
      });
      const ingress=setup.emailIngress||{domains:[],catchAllAddresses:[]}; const ingressList=byId("emailIngressDomains"); ingressList.textContent=""; const ingressBadge=byId("emailIngressCount"); ingressBadge.textContent=ingress.domains.length+" domain"+(ingress.domains.length===1?"":"s"); ingressBadge.className="setup-state "+(ingress.domains.length?"optional":"missing");
      if (!ingress.domains.length) ingressList.append(emptyState("@","No inbound domains configured","Set INBOUND_EMAIL_DOMAINS and add matching *@domain entries to addresses."));
      ingress.domains.forEach((domain,index)=>{ const row=node("div",undefined,"compact-row"); const copy=node("div",undefined,"compact-row-copy"); copy.append(node("strong",domain),node("span",ingress.catchAllAddresses[index]||("*@"+domain))); row.append(copy,node("span","Declared","setup-state optional")); ingressList.append(row); });
      const gorelo=setup.gorelo; const badge=byId("goreloConfiguredBadge"); badge.textContent=gorelo.configured?"Configured":"Not configured"; badge.className="setup-state "+(gorelo.configured?"ready":"missing");
      setText("goreloRegion",gorelo.region.toUpperCase()); setText("goreloSecretName",gorelo.secretName); setText("goreloEndpoint",gorelo.baseUrl); setText("setupCommand",gorelo.setupCommand);
      byId("copySetupCommand").disabled=!gorelo.setupCommand; byId("testGorelo").disabled=!gorelo.configured; byId("testGorelo").title=gorelo.configured?"Verify Gorelo API access":"Set the Gorelo secret, then refresh setup before testing";
      byId("importGoreloClients").disabled=!gorelo.configured||clientDirectoryLoading;
      if (goreloTestState) renderGoreloTest(goreloTestState); else byId("goreloTestResult").classList.add("hidden");
    }
    async function loadSetup() {
      clearError("setupNotice"); byId("setupContent").setAttribute("aria-busy","true");
      try { setupState=await fetchSetup(); goreloTestState=null; renderSetup(setupState); }
      catch(error) { if (setupState) renderSetup(setupState); else resetSetupView(); showError("setupNotice",error); throw error; }
      finally { byId("setupContent").removeAttribute("aria-busy"); }
    }
    async function testGoreloConnection() {
      clearError("setupNotice");
      try {
        await runBusy(byId("testGorelo"),"Testing…",async()=>{
          const data=await api("/api/v1/integrations/gorelo/test",{method:"POST"},25000); const result=data&&data.gorelo;
          const validCounts=result&&result.catalogCounts&&typeof result.catalogCounts==="object"&&!Array.isArray(result.catalogCounts)&&Object.values(result.catalogCounts).every((count)=>typeof count==="number"&&Number.isFinite(count)&&count>=0);
          if (!result||result.connected!==true||typeof result.checkedAt!=="string"||typeof result.baseUrl!=="string"||!validCounts) throw new Error("The Worker returned an invalid Gorelo connection result.");
          goreloTestState=result; renderGoreloTest(result);
        });
        showToast("Gorelo connection verified"); void loadClientDirectory(true);
      } catch(error) { showError("setupNotice",error); showToast(error.message,"error"); }
    }
    async function copySetupCommand() {
      const command=setupState?.gorelo?.setupCommand; if (!command) return;
      try {
        if (navigator.clipboard&&navigator.clipboard.writeText) await navigator.clipboard.writeText(command);
        else {
          const copyArea=node("textarea"); copyArea.value=command; copyArea.readOnly=true; copyArea.className="visually-hidden"; document.body.append(copyArea); copyArea.select(); const copied=document.execCommand("copy"); copyArea.remove(); if (!copied) throw new Error("Copy was not available.");
        }
        showToast("Setup command copied");
      } catch { showError("setupNotice",new Error("Could not copy automatically. Select the command and copy it manually.")); }
    }

    function validClientAlias(alias) {
      return alias&&typeof alias.id==="string"&&typeof alias.alias==="string"&&typeof alias.scope==="string"&&Number.isSafeInteger(alias.version)&&alias.version>=1;
    }
    function validGoreloClient(client) {
      const optionalText=(value)=>value===undefined||value===null||typeof value==="string";
      return client&&Number.isSafeInteger(client.id)&&client.id>=0&&typeof client.name==="string"&&optionalText(client.billingName)&&optionalText(client.alternateName)&&optionalText(client.status)&&typeof client.stale==="boolean"&&Array.isArray(client.domains)&&client.domains.every((domain)=>typeof domain==="string")&&Array.isArray(client.aliases)&&client.aliases.every(validClientAlias);
    }
    function parseClientDirectoryResponse(data) {
      const clients=data&&data.clients;
      if (!Array.isArray(clients)||!clients.every(validGoreloClient)||!Number.isSafeInteger(data.total)||data.total<0||(data.lastImportedAt!==undefined&&typeof data.lastImportedAt!=="string")) throw new Error("The Worker returned an invalid Gorelo client directory.");
      return {clients,total:data.total,lastImportedAt:data.lastImportedAt||null};
    }
    function resetClientDirectory() {
      goreloClients=[]; goreloClientsTotal=0; goreloClientsImportedAt=null; clientDirectoryLoaded=false; clientDirectoryLoading=false;
      const directory=byId("clientDirectory"); directory.textContent=""; directory.removeAttribute("aria-busy"); directory.append(emptyState("CL","Clients not loaded","Open Setup to load the Gorelo client directory."));
      const select=byId("aliasClientId"); select.textContent=""; const option=node("option","Import clients first"); option.value=""; select.append(option); select.disabled=true;
      byId("clientAliases").value=""; byId("aliasScope").value="global"; byId("addClientAlias").disabled=true; byId("clientResolutionIdentity").value=""; byId("clientResolutionScope").value="global"; const resolution=byId("clientResolutionResult"); resolution.textContent="Enter a source value to verify the customer it resolves to."; resolution.className="resolution-result"; byId("importGoreloClients").disabled=true; setText("clientImportStatus","Open Setup to load clients."); clearError("clientDirectoryNotice"); populateGoreloClientSelect();
    }
    function populateClientAliasSelect() {
      const select=byId("aliasClientId"); const selected=select.value; const activeClients=goreloClients.filter((client)=>!client.stale); select.textContent="";
      const prompt=node("option",activeClients.length?"Select an active client":goreloClients.length?"No active clients available":"Import clients first"); prompt.value=""; select.append(prompt);
      activeClients.forEach((client)=>{ const option=node("option",client.name+" · #"+client.id+" · "+client.aliases.length+" alias"+(client.aliases.length===1?"":"es")); option.value=String(client.id); select.append(option); });
      if (activeClients.some((client)=>String(client.id)===selected)) select.value=selected;
      select.disabled=!activeClients.length; byId("addClientAlias").disabled=!activeClients.length;
    }
    function renderClientDirectory() {
      const directory=byId("clientDirectory"); directory.textContent=""; directory.removeAttribute("aria-busy"); populateGoreloClientSelect();
      const query=byId("clientSearch").value.trim().toLocaleLowerCase();
      const filtered=goreloClients.filter((client)=>{
        if (!query) return true;
        const values=[String(client.id),client.name,client.billingName,client.alternateName,client.status,...client.domains,...client.aliases.map((alias)=>alias.alias)];
        return values.some((value)=>typeof value==="string"&&value.toLocaleLowerCase().includes(query));
      });
      const shown=filtered.slice(0,CLIENT_DIRECTORY_RENDER_LIMIT);
      const imported=goreloClientsImportedAt?"Last imported "+formatDate(goreloClientsImportedAt):"Not imported yet";
      const visible=query?(shown.length<filtered.length?"Showing "+shown.length+" of "+filtered.length+" matches":filtered.length+" match"+(filtered.length===1?"":"es")):(goreloClients.length<goreloClientsTotal?"Loaded "+goreloClients.length+" of "+goreloClientsTotal:goreloClientsTotal+" client"+(goreloClientsTotal===1?"":"s"));
      setText("clientImportStatus",visible+" · "+imported);
      if (!filtered.length) {
        const canImport=!query&&setupState?.gorelo?.configured===true;
        directory.append(emptyState(query?"?":"CL",query?"No matching clients":"No clients imported",query?"Try another client name, domain, alias, or ID.":"Import the current client directory from Gorelo to begin mapping source identifiers.",canImport?"Import from Gorelo":undefined,canImport?importGoreloClients:undefined));
        populateClientAliasSelect(); return;
      }
      shown.forEach((client)=>{
        const row=node("article",undefined,"directory-row");
        const heading=node("div",undefined,"directory-row-heading"); const copy=node("div"); copy.append(node("h4",client.name));
        const metadata=["Gorelo #"+client.id]; if (client.status) metadata.push(client.status); metadata.push(client.aliases.length+" alias"+(client.aliases.length===1?"":"es")); copy.append(node("p",metadata.join(" · "))); heading.append(copy);
        const headingActions=node("div",undefined,"directory-heading-actions"); if (client.stale) headingActions.append(node("span","Stale","badge disabled")); else { const add=node("button","+ Aliases","btn small"); add.type="button"; add.setAttribute("aria-label","Add aliases for "+client.name); add.onclick=()=>{ byId("aliasClientId").value=String(client.id); byId("clientAliases").focus(); }; headingActions.append(add); } heading.append(headingActions);
        row.append(heading);
        const identifiers=node("div",undefined,"directory-identifiers");
        const secondary=[client.billingName,client.alternateName].filter((value)=>value&&value!==client.name); secondary.forEach((value)=>identifiers.append(node("span",value,"chip")));
        client.domains.forEach((domain)=>identifiers.append(node("span",domain,"chip"))); if (identifiers.childElementCount) row.append(identifiers);
        const aliases=node("div",undefined,"alias-section"); aliases.append(node("span","Customer aliases · "+client.aliases.length,"alias-section-label")); const groups=node("div",undefined,"alias-groups");
        if (!client.aliases.length) groups.append(node("span","No aliases assigned","subtle"));
        const byScope=new Map(); client.aliases.forEach((alias)=>{ if (!byScope.has(alias.scope)) byScope.set(alias.scope,[]); byScope.get(alias.scope).push(alias); });
        byScope.forEach((scopeAliases,scope)=>{ const group=node("div",undefined,"alias-group"); group.append(node("span",scope==="global"?"Global":scope,"alias-scope-label")); const chips=node("div",undefined,"alias-chips"); scopeAliases.forEach((alias)=>{ const chip=node("span",undefined,"alias-chip"); chip.append(node("span",alias.alias)); const edit=node("button","Edit","alias-edit"); edit.type="button"; edit.setAttribute("aria-label","Edit client alias "+alias.alias+" in "+alias.scope+" scope"); edit.onclick=()=>openClientAliasEditor(client,alias); const remove=node("button","×","alias-remove"); remove.type="button"; remove.setAttribute("aria-label","Remove client alias "+alias.alias+" in "+alias.scope+" scope"); remove.onclick=()=>deleteClientAlias(alias,remove); chip.append(edit,remove); chips.append(chip); }); group.append(chips); groups.append(group); });
        aliases.append(groups); row.append(aliases); directory.append(row);
      });
      populateClientAliasSelect();
    }
    async function fetchClientDirectoryPages() {
      const clients=[]; const clientIds=new Set(); let total=null; let target=null; let lastImportedAt=null;
      do {
        const remaining=target===null?CLIENT_DIRECTORY_PAGE_SIZE:target-clients.length;
        const limit=Math.min(CLIENT_DIRECTORY_PAGE_SIZE,remaining); const offset=clients.length;
        const result=parseClientDirectoryResponse(await api("/api/v1/integrations/gorelo/clients?limit="+String(limit)+"&offset="+String(offset)));
        if (total===null) { total=result.total; target=Math.min(total,CLIENT_DIRECTORY_MAX_CLIENTS); lastImportedAt=result.lastImportedAt; }
        else if (result.total!==total||result.lastImportedAt!==lastImportedAt) throw new Error("The Gorelo client directory changed while it was loading. Refresh and try again.");
        const accepted=result.clients.slice(0,Math.max(0,target-clients.length));
        if (!accepted.length&&clients.length<target) throw new Error("The Worker returned an incomplete Gorelo client directory.");
        accepted.forEach((client)=>{ if (clientIds.has(client.id)) throw new Error("The Worker returned a duplicate Gorelo client."); clientIds.add(client.id); clients.push(client); });
      } while (target===null||clients.length<target);
      return {clients,total:total??0,lastImportedAt};
    }
    async function loadClientDirectory(force=false) {
      if (clientDirectoryLoading||(!force&&clientDirectoryLoaded)) return;
      clientDirectoryLoading=true; clearError("clientDirectoryNotice"); loading(byId("clientDirectory")); setText("clientImportStatus","Loading Gorelo clients…"); byId("importGoreloClients").disabled=true;
      try {
        const result=await fetchClientDirectoryPages(); goreloClients=result.clients; goreloClientsTotal=result.total; goreloClientsImportedAt=result.lastImportedAt; clientDirectoryLoaded=true; renderClientDirectory();
      } catch(error) {
        clientDirectoryLoaded=false; const directory=byId("clientDirectory"); directory.textContent=""; directory.removeAttribute("aria-busy"); directory.append(emptyState("!","Client directory unavailable","Mail routing remains available. Refresh this panel after the optional integration endpoint is configured.","Retry",()=>loadClientDirectory(true))); setText("clientImportStatus","Unavailable"); showError("clientDirectoryNotice",error);
      } finally { clientDirectoryLoading=false; byId("importGoreloClients").disabled=!setupState?.gorelo?.configured; }
    }
    async function importGoreloClients() {
      if (!setupState?.gorelo?.configured||clientDirectoryLoading||byId("importGoreloClients").disabled) return;
      clearError("clientDirectoryNotice"); let imported;
      try {
        await runBusy(byId("importGoreloClients"),"Importing…",async()=>{
          const data=await api("/api/v1/integrations/gorelo/clients/import",{method:"POST"}); imported=data&&data.import;
          if (!imported||![imported.created,imported.updated,imported.total].every((value)=>Number.isSafeInteger(value)&&value>=0)||typeof imported.completedAt!=="string") throw new Error("The Worker returned an invalid client import result.");
          await loadClientDirectory(true);
        });
        showToast("Imported "+imported.total+" Gorelo client"+(imported.total===1?"":"s")+" · "+imported.created+" new, "+imported.updated+" updated");
      } catch(error) { showError("clientDirectoryNotice",error); showToast(error.message,"error"); }
    }
    function safeAliasInput(value) { return value.length>0&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value); }
    function safeAliasScope(value) { return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
    function readClientAliasBatch() {
      const aliases=byId("clientAliases").value.split(/\r?\n/).map((alias)=>alias.trim()).filter(Boolean);
      if (!aliases.length||aliases.length>100) throw new Error("Enter between 1 and 100 aliases, one per line.");
      if (!aliases.every(safeAliasInput)) throw new Error("Each alias must be between 1 and 512 characters without control characters.");
      const normalized=new Set(); aliases.forEach((alias)=>{ const key=alias.normalize("NFKC").trim().replace(/\s+/gu," ").toLocaleLowerCase(); if (normalized.has(key)) throw new Error("Remove duplicate aliases from this batch: "+alias); normalized.add(key); });
      return aliases;
    }
    async function addClientAliases() {
      clearError("clientDirectoryNotice"); if (!byId("clientAliasForm").reportValidity()) return;
      const clientId=Number(byId("aliasClientId").value); const scope=byId("aliasScope").value.trim(); let aliases;
      if (!Number.isSafeInteger(clientId)||!goreloClients.some((client)=>client.id===clientId&&!client.stale)) { showError("clientDirectoryNotice",new Error("Select an active imported Gorelo client.")); return; }
      if (!safeAliasScope(scope)) { showError("clientDirectoryNotice",new Error("Enter a safe alias scope such as global or vendor-a.")); return; }
      try { aliases=readClientAliasBatch(); } catch(error) { showError("clientDirectoryNotice",error); return; }
      try {
        await runBusy(byId("addClientAlias"),"Adding…",async()=>{ const data=await api("/api/v1/integrations/gorelo/client-aliases/batch",{method:"POST",body:JSON.stringify({clientId,aliases:aliases.map((alias)=>({alias,scope}))})}); if (!data||data.created!==aliases.length||!Array.isArray(data.aliases)||data.aliases.length!==aliases.length||!data.aliases.every(validClientAlias)) throw new Error("The Worker returned an invalid client alias batch."); await loadClientDirectory(true); });
        byId("clientAliases").value=""; showToast(aliases.length+" customer alias"+(aliases.length===1?"":"es")+" added to "+scope+" scope");
      } catch(error) { showError("clientDirectoryNotice",error); showToast(error.message,"error"); }
    }
    function closeClientAliasEditor() { if (byId("clientAliasDialog").open) byId("clientAliasDialog").close(); else editingClientAlias=null; }
    function openClientAliasEditor(client,alias) {
      editingClientAlias={...alias}; setText("clientAliasDialogDescription","Alias for "+client.name+" · optimistic version "+alias.version); byId("editClientAlias").value=alias.alias; byId("editAliasScope").value=alias.scope; clearError("clientAliasDialogError"); byId("clientAliasDialog").showModal(); byId("editClientAlias").focus();
    }
    async function saveClientAliasEdit() {
      clearError("clientAliasDialogError"); const current=editingClientAlias; if (!current) return;
      if (!byId("clientAliasEditForm").reportValidity()) return; const alias=byId("editClientAlias").value.trim(); const scope=byId("editAliasScope").value.trim();
      if (!safeAliasInput(alias)) { showError("clientAliasDialogError",new Error("Enter an alias between 1 and 512 characters without control characters.")); return; }
      if (!safeAliasScope(scope)) { showError("clientAliasDialogError",new Error("Enter a safe alias scope such as global or vendor-a.")); return; }
      try {
        await runBusy(byId("saveClientAliasEdit"),"Saving…",async()=>{ const data=await api("/api/v1/integrations/gorelo/client-aliases/"+encodeURIComponent(current.id),{method:"PUT",body:JSON.stringify({alias,scope,version:current.version})}); if (!validClientAlias(data&&data.alias)||data.alias.version!==current.version+1) throw new Error("The Worker returned an invalid updated client alias."); }); closeClientAliasEditor(); await loadClientDirectory(true); showToast("Customer alias updated");
      } catch(error) {
        if (error&&error.status===409&&error.details&&Number.isSafeInteger(error.details.currentVersion)) { closeClientAliasEditor(); await loadClientDirectory(true); showError("clientDirectoryNotice",error); showToast("Alias changed elsewhere; the directory was refreshed","error"); }
        else { showError("clientAliasDialogError",error); showToast(error.message,"error"); }
      }
    }
    async function deleteClientAlias(alias,button) {
      if (!window.confirm("Remove customer alias \""+alias.alias+"\" from the "+alias.scope+" scope? Existing parser rules may stop resolving it.")) return;
      clearError("clientDirectoryNotice");
      try { await runBusy(button,"…",async()=>{ await api("/api/v1/integrations/gorelo/client-aliases/"+encodeURIComponent(alias.id)+"?version="+encodeURIComponent(String(alias.version)),{method:"DELETE"}); await loadClientDirectory(true); }); showToast("Client alias removed"); }
      catch(error) { if (error&&error.status===409) await loadClientDirectory(true); showError("clientDirectoryNotice",error); showToast(error.message,"error"); }
    }
    function renderClientResolution(resolution) {
      const output=byId("clientResolutionResult"); output.className="resolution-result";
      if (resolution&&resolution.status==="resolved"&&validGoreloClient(resolution.client)&&typeof resolution.matchedBy==="string") { output.textContent="Resolved to "+resolution.client.name+" · Gorelo #"+resolution.client.id+" · matched by "+resolution.matchedBy.replaceAll("_"," "); output.classList.add("resolved"); return; }
      if (resolution&&resolution.status==="not_found"&&resolution.reason==="stale_alias"&&typeof resolution.normalizedIdentity==="string"&&safeAliasScope(resolution.aliasScope)) { output.textContent="An exact alias exists in the "+resolution.aliasScope+" scope, but its Gorelo client is stale. Re-import clients or update that alias before enabling the rule."; output.classList.add("unresolved"); return; }
      if (resolution&&resolution.status==="not_found"&&typeof resolution.normalizedIdentity==="string") { output.textContent="No exact current client or alias matched this value."; output.classList.add("unresolved"); return; }
      if (resolution&&resolution.status==="ambiguous"&&Array.isArray(resolution.candidates)&&resolution.candidates.length<=5000&&resolution.candidates.every((candidate)=>Number.isSafeInteger(candidate.clientId)&&typeof candidate.clientName==="string"&&typeof candidate.matchedBy==="string")) { const shown=resolution.candidates.slice(0,5).map((candidate)=>candidate.clientName+" (#"+candidate.clientId+")"); output.textContent="Ambiguous exact client match: "+shown.join(", ")+(resolution.candidates.length>shown.length?" and "+(resolution.candidates.length-shown.length)+" more":"")+". Update the conflicting client identity or alias before enabling the rule."; output.classList.add("unresolved"); return; }
      throw new Error("The Worker returned an invalid client resolution preview.");
    }
    async function previewClientResolution() {
      const output=byId("clientResolutionResult"); output.className="resolution-result"; const identity=byId("clientResolutionIdentity").value.trim(); const scope=byId("clientResolutionScope").value.trim();
      if (!safeAliasInput(identity)) { output.textContent="Enter a value between 1 and 512 characters without control characters."; output.classList.add("unresolved"); return; }
      if (!safeAliasScope(scope)) { output.textContent="Enter a safe alias scope such as global or vendor-a."; output.classList.add("unresolved"); return; }
      try { await runBusy(byId("previewClientResolution"),"Checking…",async()=>{ const parameters=new URLSearchParams({identity,scope}); const data=await api("/api/v1/integrations/gorelo/client-resolution?"+parameters.toString()); renderClientResolution(data&&data.resolution); }); }
      catch(error) { output.textContent=error.message; output.classList.add("unresolved"); }
    }

    function validMailbox(mailbox,requireRoutingFlags=false) {
      return mailbox&&typeof mailbox.id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mailbox.id)&&typeof mailbox.name==="string"&&mailbox.name.length>0&&mailbox.name.length<=120&&typeof mailbox.address==="string"&&mailbox.address.length>3&&mailbox.address.length<=254&&typeof mailbox.enabled==="boolean"&&typeof mailbox.isDefault==="boolean"&&Number.isSafeInteger(mailbox.version)&&mailbox.version>=1&&typeof mailbox.createdAt==="string"&&typeof mailbox.updatedAt==="string"&&(!requireRoutingFlags||(typeof mailbox.allowlisted==="boolean"&&typeof mailbox.routable==="boolean"));
    }
    function parseMailboxesResponse(data) {
      const items=data&&data.mailboxes; const defaultId=data&&data.defaultMailboxId; const version=data&&data.version;
      if (!Array.isArray(items)||!items.every((mailbox)=>validMailbox(mailbox,true))||(defaultId!==null&&typeof defaultId!=="string")||(version!==null&&(!Number.isSafeInteger(version)||version<1))) throw new Error("The Worker returned an invalid Gorelo mailbox directory.");
      if (defaultId&&!items.some((mailbox)=>mailbox.id===defaultId&&mailbox.isDefault)) throw new Error("The Worker returned an inconsistent default Gorelo mailbox.");
      return {mailboxes:items,defaultMailboxId:defaultId,version};
    }
    function populateActionMailboxSelect(preferred) {
      const select=byId("actionMailboxId"); if (!select) return; const wanted=preferred===undefined?select.value:preferred; const defaultMailbox=defaultGoreloMailbox(); select.textContent=""; select.append(makeOption("",defaultMailbox?"Use default — "+defaultMailbox.name+" · "+defaultMailbox.address:"Use default Gorelo mailbox"));
      goreloMailboxes.filter((mailbox)=>mailbox.routable).forEach((mailbox)=>select.append(makeOption(mailbox.id,mailbox.name+" · "+mailbox.address+(mailbox.isDefault?" · default":""))));
      if (wanted&&wanted.startsWith("legacy:")) select.append(makeOption(wanted,"Legacy address · "+wanted.slice(7)));
      else if (wanted&&!goreloMailboxes.some((mailbox)=>mailbox.id===wanted&&mailbox.routable)) select.append(makeOption(wanted,"Saved mailbox unavailable · "+wanted)); select.value=wanted||"";
    }
    function populateParserMailboxSelect(preferred) {
      const select=byId("parserMailboxId"); if (!select) return; const wanted=preferred===undefined?select.value:preferred; const defaultMailbox=defaultGoreloMailbox(); const fallbackAddress=runtimeConfig?.defaultGoreloAddress; select.textContent=""; select.append(makeOption("",defaultMailbox?"Follow default — "+defaultMailbox.name+" · "+defaultMailbox.address:fallbackAddress?"Follow default · "+fallbackAddress:"Follow the default Gorelo mailbox")); goreloMailboxes.filter((mailbox)=>mailbox.routable).forEach((mailbox)=>select.append(makeOption(mailbox.id,"Pin to "+mailbox.name+" · "+mailbox.address+(mailbox.isDefault?" · current default":"")))); if (wanted&&!goreloMailboxes.some((mailbox)=>mailbox.id===wanted&&mailbox.routable)) select.append(makeOption(wanted,"Saved mailbox unavailable · "+wanted)); select.value=wanted||"";
    }
    function populateReviewMailboxSelect(preferred) {
      const select=byId("reviewMailboxId"); const wanted=preferred||goreloMailboxDefaultId||""; select.textContent=""; select.append(makeOption("","Select an enabled mailbox")); goreloMailboxes.filter((mailbox)=>mailbox.routable).forEach((mailbox)=>select.append(makeOption(mailbox.id,mailbox.name+" · "+mailbox.address+(mailbox.isDefault?" · default":"")))); select.value=goreloMailboxes.some((mailbox)=>mailbox.id===wanted&&mailbox.routable)?wanted:"";
    }
    function resetMailboxForm() {
      editingMailboxId=null; byId("mailboxForm").classList.add("hidden"); setText("mailboxFormHeading","Add Gorelo mailbox"); setText("mailboxFormDescription","Register a verified address on an allowed domain."); setText("mailboxFormMode","New"); byId("mailboxName").value=""; byId("mailboxAddress").value=""; byId("mailboxAddress").disabled=false; byId("mailboxAddress").required=true; byId("mailboxEnabled").checked=true; clearError("mailboxFormError");
    }
    function resetMailboxes() {
      goreloMailboxes=[]; goreloMailboxDefaultId=null; goreloMailboxSettingsVersion=null; goreloMailboxesLoaded=false; goreloMailboxesLoading=false; resetMailboxForm(); byId("addMailbox").disabled=true; clearError("mailboxNotice"); const list=byId("mailboxList"); list.textContent=""; list.removeAttribute("aria-busy"); list.append(emptyState("forward","Mailboxes not loaded","Open Setup to load the named Gorelo destinations.")); populateActionMailboxSelect(); populateParserMailboxSelect(); populateReviewMailboxSelect();
    }
    function renderMailboxes() {
      const list=byId("mailboxList"); list.textContent=""; list.removeAttribute("aria-busy"); byId("addMailbox").disabled=false;
      if (!goreloMailboxes.length) { list.append(emptyState("forward","No Gorelo mailboxes","Register a verified Gorelo destination on an allowed domain before creating forward rules.","Add mailbox",()=>openMailboxForm(null))); populateActionMailboxSelect(); populateReviewMailboxSelect(); return; }
      goreloMailboxes.forEach((mailbox)=>{
        const row=node("article",undefined,"mailbox-row"); const copy=node("div",undefined,"mailbox-row-heading"); const heading=node("h4",mailbox.name); if (mailbox.isDefault) heading.append(node("span","Default","setup-state ready")); if (!mailbox.enabled) heading.append(node("span","Disabled","setup-state optional")); else if (!mailbox.allowlisted) heading.append(node("span","Destination not allowed","setup-state missing")); copy.append(heading,node("span",mailbox.address,"mailbox-address"));
        const actions=node("div",undefined,"mailbox-actions"); if (!mailbox.isDefault) { const makeDefault=node("button","Make default","btn small"); makeDefault.type="button"; makeDefault.disabled=!mailbox.routable; makeDefault.title=mailbox.routable?"Use for unmatched mail and default-following rules":"Enable this mailbox and permit its domain or exact address before making it default"; makeDefault.onclick=()=>setDefaultMailbox(mailbox,makeDefault); actions.append(makeDefault); }
        const edit=node("button","Edit","btn small"); edit.type="button"; edit.onclick=()=>openMailboxForm(mailbox); const toggle=node("button",mailbox.enabled?"Disable":"Enable","btn small"); toggle.type="button"; toggle.disabled=mailbox.isDefault; toggle.title=mailbox.isDefault?"Choose another default mailbox before disabling this one":""; toggle.onclick=()=>toggleMailbox(mailbox,toggle); const remove=node("button","Delete","btn danger small"); remove.type="button"; remove.disabled=mailbox.isDefault; remove.title=mailbox.isDefault?"Choose another default mailbox before deleting this one":""; remove.onclick=()=>deleteMailbox(mailbox,remove); actions.append(edit,toggle,remove); row.append(copy,actions); list.append(row);
      });
      populateActionMailboxSelect(); populateParserMailboxSelect(); populateReviewMailboxSelect(); if (rulesCache.length) renderRules();
    }
    async function loadMailboxes(force=false) {
      if (goreloMailboxesLoading||(!force&&goreloMailboxesLoaded)) return; goreloMailboxesLoading=true; clearError("mailboxNotice"); loading(byId("mailboxList")); byId("addMailbox").disabled=true;
      try { const result=parseMailboxesResponse(await api("/api/v1/integrations/gorelo/mailboxes")); goreloMailboxes=result.mailboxes; goreloMailboxDefaultId=result.defaultMailboxId; goreloMailboxSettingsVersion=result.version; goreloMailboxesLoaded=true; renderMailboxes(); }
      catch(error) { goreloMailboxesLoaded=false; const list=byId("mailboxList"); list.textContent=""; list.removeAttribute("aria-busy"); list.append(emptyState("!","Mailboxes unavailable","Forwarding continues with the deployment default. Refresh after checking Setup readiness.","Retry",()=>loadMailboxes(true))); showError("mailboxNotice",error); }
      finally { goreloMailboxesLoading=false; populateActionMailboxSelect(); populateParserMailboxSelect(); populateReviewMailboxSelect(); }
    }
    function openMailboxForm(mailbox) {
      editingMailboxId=mailbox?.id||null; setText("mailboxFormHeading",mailbox?"Edit Gorelo mailbox":"Add Gorelo mailbox"); setText("mailboxFormDescription",mailbox?"Rename or change availability. The routing address stays fixed.":"Register a verified address on an allowed domain."); setText("mailboxFormMode",mailbox?"Editing":"New"); byId("mailboxName").value=mailbox?.name||""; byId("mailboxAddress").value=mailbox?.address||""; byId("mailboxAddress").disabled=Boolean(mailbox); byId("mailboxAddress").required=!mailbox; byId("mailboxEnabled").checked=mailbox?mailbox.enabled:true; byId("mailboxEnabled").disabled=Boolean(mailbox?.isDefault); clearError("mailboxFormError"); byId("mailboxForm").classList.remove("hidden"); byId("mailboxName").focus();
    }
    function closeMailboxForm() { resetMailboxForm(); byId("mailboxEnabled").disabled=false; byId("addMailbox").focus(); }
    async function saveMailbox() {
      clearError("mailboxFormError"); if (!byId("mailboxForm").reportValidity()) return; const current=editingMailboxId?mailboxById(editingMailboxId):null; if (editingMailboxId&&!current) { showError("mailboxFormError",new Error("This mailbox changed. Refresh Setup and try again.")); return; }
      const name=byId("mailboxName").value.trim(); const enabled=byId("mailboxEnabled").checked; const body=current?{name,enabled,version:current.version}:{name,address:byId("mailboxAddress").value.trim(),enabled};
      try { await runBusy(byId("saveMailbox"),"Saving…",async()=>{ const path=current?"/api/v1/integrations/gorelo/mailboxes/"+encodeURIComponent(current.id):"/api/v1/integrations/gorelo/mailboxes"; const data=await api(path,{method:current?"PUT":"POST",body:JSON.stringify(body)}); if (!validMailbox(data&&data.mailbox)) throw new Error("The Worker returned an invalid Gorelo mailbox."); await loadMailboxes(true); }); resetMailboxForm(); byId("mailboxEnabled").disabled=false; showToast(current?"Gorelo mailbox updated":"Gorelo mailbox added"); }
      catch(error) { showError("mailboxFormError",error); showToast(error.message,"error"); }
    }
    async function setDefaultMailbox(mailbox,button) {
      if (!Number.isSafeInteger(goreloMailboxSettingsVersion)) { showError("mailboxNotice",new Error("Refresh the mailbox directory before changing the default.")); return; }
      clearError("mailboxNotice"); try { await runBusy(button,"Saving…",async()=>{ await api("/api/v1/integrations/gorelo/mailboxes/default",{method:"PUT",body:JSON.stringify({mailboxId:mailbox.id,version:goreloMailboxSettingsVersion})}); await loadMailboxes(true); }); showToast(mailbox.name+" is now the default Gorelo mailbox"); }
      catch(error) { if (error&&error.status===409) await loadMailboxes(true); showError("mailboxNotice",error); showToast(error.message,"error"); }
    }
    async function toggleMailbox(mailbox,button) {
      clearError("mailboxNotice"); try { await runBusy(button,mailbox.enabled?"Disabling…":"Enabling…",async()=>{ await api("/api/v1/integrations/gorelo/mailboxes/"+encodeURIComponent(mailbox.id),{method:"PUT",body:JSON.stringify({name:mailbox.name,enabled:!mailbox.enabled,version:mailbox.version})}); await loadMailboxes(true); }); showToast(mailbox.enabled?"Gorelo mailbox disabled":"Gorelo mailbox enabled"); }
      catch(error) { if (error&&error.status===409) await loadMailboxes(true); showError("mailboxNotice",error); showToast(error.message,"error"); }
    }
    async function deleteMailbox(mailbox,button) {
      if (!window.confirm("Delete Gorelo mailbox ‘"+mailbox.name+"’? Rules that reference it must be repointed first.")) return; clearError("mailboxNotice");
      try { await runBusy(button,"Deleting…",async()=>{ await api("/api/v1/integrations/gorelo/mailboxes/"+encodeURIComponent(mailbox.id)+"?version="+encodeURIComponent(String(mailbox.version)),{method:"DELETE"}); if (editingMailboxId===mailbox.id) resetMailboxForm(); await loadMailboxes(true); }); showToast("Gorelo mailbox deleted"); }
      catch(error) { if (error&&error.status===409) await loadMailboxes(true); showError("mailboxNotice",error); showToast(error.message,"error"); }
    }

    function validInboundWebhookSource(source) {
      return source&&typeof source.id==="string"&&typeof source.name==="string"&&typeof source.slug==="string"&&typeof source.enabled==="boolean"&&Array.isArray(source.mappings)&&source.mappings.length>=1&&source.mappings.length<=50&&source.action&&typeof source.action.type==="string"&&Number.isSafeInteger(source.rateLimitPerMinute)&&source.rateLimitPerMinute>=1&&source.rateLimitPerMinute<=1000&&typeof source.tokenHint==="string"&&source.tokenHint.length===6&&Number.isSafeInteger(source.version)&&source.version>=1&&typeof source.createdAt==="string"&&typeof source.updatedAt==="string"&&source.endpointPath==="/hooks/v1/"+source.slug;
    }
    function inboundWebhookActionLabel(action) {
      if (action.type==="accept") return "Audit only";
      if (action.type==="send_webhook") { const destination=webhooks.find((item)=>item.id===action.destinationId); return "Signed webhook → "+(destination?.name||action.destinationId); }
      const template=rulesCache.find((rule)=>rule.id===action.ruleId); return "Gorelo → "+(template?.name||"unavailable rule action");
    }
    function populateInboundWebhookOptions(source) {
      const destination=byId("inboundWebhookDestination"); const wantedDestination=source?.action?.type==="send_webhook"?source.action.destinationId:destination.value; destination.textContent=""; destination.append(makeOption("","Select a registered destination")); webhooks.filter((item)=>item.enabled).forEach((item)=>destination.append(makeOption(item.id,item.name+" · "+item.url))); destination.value=wantedDestination||"";
      const rule=byId("inboundWebhookRule"); const wantedRule=source?.action?.type==="gorelo_rule"?source.action.ruleId:rule.value; rule.textContent=""; rule.append(makeOption("","Select a ticket or alert rule")); rulesCache.filter((item)=>item.action.type==="create_ticket"||item.action.type==="create_alert").forEach((item)=>rule.append(makeOption(item.id,item.name+" · "+(item.action.type==="create_ticket"?"ticket":"alert")))); rule.value=wantedRule||"";
    }
    function updateInboundWebhookActionFields() {
      const action=byId("inboundWebhookSourceAction").value; byId("inboundWebhookDestinationGroup").classList.toggle("hidden",action!=="send_webhook"); byId("inboundWebhookEventTypeGroup").classList.toggle("hidden",action!=="send_webhook"); byId("inboundWebhookRuleGroup").classList.toggle("hidden",action!=="gorelo_rule"); byId("inboundWebhookDestination").required=action==="send_webhook"; byId("inboundWebhookRule").required=action==="gorelo_rule";
    }
    function mappingLines(mappings) { return mappings.map((mapping)=>mapping.key+(mapping.required?"!":"")+" = "+mapping.pointer).join("\n"); }
    function parseInboundWebhookMappings() {
      const lines=byId("inboundWebhookMappings").value.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean); if (!lines.length||lines.length>50) throw new Error("Add between 1 and 50 JSON Pointer mappings."); const seen=new Set(); return lines.map((line,index)=>{ const match=line.match(/^([A-Za-z_][A-Za-z0-9_]{0,63})(!)?\s*=\s*(\/.+)$/); if (!match) throw new Error("Mapping line "+(index+1)+" must use variable = /json/pointer."); const key=match[1]; if (seen.has(key)) throw new Error("Mapping variable "+key+" is duplicated."); seen.add(key); if (/~(?:[^01]|$)/.test(match[3])) throw new Error("Mapping line "+(index+1)+" has an invalid JSON Pointer escape."); return {key,pointer:match[3],required:Boolean(match[2]),maxCharacters:4000}; });
    }
    function resetInboundWebhookSourceForm() {
      editingInboundWebhookSourceId=null; byId("inboundWebhookSourceForm").classList.add("hidden"); setText("inboundWebhookSourceFormHeading","Add webhook source"); setText("inboundWebhookSourceFormMode","New"); setText("saveInboundWebhookSource","Create source"); byId("inboundWebhookSourceName").value=""; byId("inboundWebhookSourceSlug").value=""; byId("inboundWebhookSourceAction").value="accept"; byId("inboundWebhookRateLimit").value="60"; byId("inboundWebhookEventType").value="webhook.routed"; byId("inboundWebhookMappings").value="customer! = /client/name\ndetails = /message"; byId("inboundWebhookSourceEnabled").checked=true; clearError("inboundWebhookSourceFormError"); updateInboundWebhookActionFields();
    }
    function closeInboundWebhookSourceForm(restoreFocus=true) { const invoker=inboundWebhookSourceInvoker; inboundWebhookSourceInvoker=null; resetInboundWebhookSourceForm(); if (restoreFocus) requestAnimationFrame(()=>{ if (invoker&&document.contains(invoker)) invoker.focus(); else byId("addInboundWebhookSource").focus(); }); }
    function showInboundWebhookToken(source,tokenValue) { setText("inboundWebhookTokenTitle","Save token for "+source.name); setText("inboundWebhookTokenContext",location.origin+source.endpointPath+" · shown once; only its SHA-256 digest is stored."); setText("inboundWebhookTokenValue",tokenValue); byId("inboundWebhookToken").classList.remove("hidden"); byId("copyInboundWebhookToken").focus(); }
    function resetInboundWebhookSources() {
      inboundWebhookSources=[]; inboundWebhookSourcesLoaded=false; inboundWebhookSourcesLoading=false; inboundWebhookSourceInvoker=null; resetInboundWebhookSourceForm(); byId("inboundWebhookToken").classList.add("hidden"); clearError("inboundWebhookSourceNotice"); const list=byId("inboundWebhookSourceList"); list.textContent=""; list.removeAttribute("aria-busy"); list.append(emptyState("api","Sources not loaded","Open Setup to load authenticated webhook sources."));
    }
    function renderInboundWebhookSources() {
      const list=byId("inboundWebhookSourceList"); list.textContent=""; list.removeAttribute("aria-busy"); populateInboundWebhookOptions();
      if (!inboundWebhookSources.length) { list.append(emptyState("api","No inbound webhook sources","Create a private endpoint for a monitoring platform, form, or automation system.","Add source",(event)=>openInboundWebhookSourceForm(null,event?.currentTarget))); return; }
      inboundWebhookSources.forEach((source)=>{ const row=node("article",undefined,"source-row"); const heading=node("div",undefined,"source-row-heading"); const copy=node("div"); copy.append(node("h4",source.name),node("p",location.origin+source.endpointPath)); heading.append(copy,node("span",source.enabled?"Active":"Paused","setup-state "+(source.enabled?"ready":"optional"))); const meta=node("div",undefined,"source-row-meta"); meta.append(node("span",inboundWebhookActionLabel(source.action),"chip"),node("span",source.mappings.length+" mapped value"+(source.mappings.length===1?"":"s"),"chip"),node("span",source.rateLimitPerMinute+"/min","chip"),node("span","Token …"+source.tokenHint,"chip")); const actions=node("div",undefined,"source-row-actions"); const edit=node("button","Edit","btn small"); edit.type="button"; edit.onclick=()=>openInboundWebhookSourceForm(source,edit); const capture=node("button","Capture next","btn small"); capture.type="button"; capture.onclick=()=>captureInboundWebhook(source,capture); const rotate=node("button","Rotate token","btn small"); rotate.type="button"; rotate.onclick=()=>rotateInboundWebhookToken(source,rotate); const remove=node("button","Delete","btn danger small"); remove.type="button"; remove.onclick=()=>deleteInboundWebhookSource(source,remove); actions.append(edit,capture,rotate,remove); row.append(heading,meta,actions); list.append(row); });
    }
    async function loadInboundWebhookSources(force=false) {
      if (inboundWebhookSourcesLoading||(!force&&inboundWebhookSourcesLoaded)) return; inboundWebhookSourcesLoading=true; clearError("inboundWebhookSourceNotice"); loading(byId("inboundWebhookSourceList"));
      try { const data=await api("/api/v1/inbound-webhook-sources"); if (!Array.isArray(data&&data.sources)||!data.sources.every(validInboundWebhookSource)) throw new Error("The Worker returned an invalid webhook source directory."); inboundWebhookSources=data.sources; inboundWebhookSourcesLoaded=true; renderInboundWebhookSources(); }
      catch(error) { inboundWebhookSourcesLoaded=false; const list=byId("inboundWebhookSourceList"); list.textContent=""; list.removeAttribute("aria-busy"); list.append(emptyState("!","Webhook sources unavailable","Refresh after applying the current D1 migrations.","Retry",()=>loadInboundWebhookSources(true))); showError("inboundWebhookSourceNotice",error); }
      finally { inboundWebhookSourcesLoading=false; }
    }
    function openInboundWebhookSourceForm(source,invoker=document.activeElement) {
      inboundWebhookSourceInvoker=invoker; editingInboundWebhookSourceId=source?.id||null; setText("inboundWebhookSourceFormHeading",source?"Edit webhook source":"Add webhook source"); setText("inboundWebhookSourceFormMode",source?"Editing":"New"); setText("saveInboundWebhookSource",source?"Save source":"Create source"); byId("inboundWebhookSourceName").value=source?.name||""; byId("inboundWebhookSourceSlug").value=source?.slug||""; byId("inboundWebhookSourceAction").value=source?.action?.type||"accept"; byId("inboundWebhookRateLimit").value=String(source?.rateLimitPerMinute||60); byId("inboundWebhookEventType").value=source?.action?.type==="send_webhook"?source.action.eventType:"webhook.routed"; byId("inboundWebhookMappings").value=source?mappingLines(source.mappings):"customer! = /client/name\ndetails = /message"; byId("inboundWebhookSourceEnabled").checked=source?source.enabled:true; populateInboundWebhookOptions(source); updateInboundWebhookActionFields(); clearError("inboundWebhookSourceFormError"); byId("inboundWebhookSourceForm").classList.remove("hidden"); byId("inboundWebhookSourceName").focus();
    }
    async function saveInboundWebhookSource() {
      clearError("inboundWebhookSourceFormError"); if (!byId("inboundWebhookSourceForm").reportValidity()) return; const current=editingInboundWebhookSourceId?inboundWebhookSources.find((source)=>source.id===editingInboundWebhookSourceId):null; if (editingInboundWebhookSourceId&&!current) { showError("inboundWebhookSourceFormError",new Error("This source changed. Refresh Setup and try again.")); return; } let mappings; try { mappings=parseInboundWebhookMappings(); } catch(error) { showError("inboundWebhookSourceFormError",error); return; } const type=byId("inboundWebhookSourceAction").value; let action={type:"accept"}; if (type==="send_webhook") action={type,destinationId:byId("inboundWebhookDestination").value,eventType:byId("inboundWebhookEventType").value.trim()}; else if (type==="gorelo_rule") action={type,ruleId:byId("inboundWebhookRule").value}; const body={name:byId("inboundWebhookSourceName").value.trim(),slug:byId("inboundWebhookSourceSlug").value.trim().toLowerCase(),enabled:byId("inboundWebhookSourceEnabled").checked,mappings,action,rateLimitPerMinute:Number(byId("inboundWebhookRateLimit").value),...(current?{version:current.version}:{})}; if (current&&current.slug!==body.slug&&!window.confirm("Change this live endpoint from /hooks/v1/"+current.slug+" to /hooks/v1/"+body.slug+"? Existing senders must be updated immediately.")) return;
      try { await runBusy(byId("saveInboundWebhookSource"),"Saving…",async()=>{ const data=await api(current?"/api/v1/inbound-webhook-sources/"+encodeURIComponent(current.id):"/api/v1/inbound-webhook-sources",{method:current?"PUT":"POST",body:JSON.stringify(body)}); const source=data&&data.source; if (!validInboundWebhookSource(source)) throw new Error("The Worker returned an invalid webhook source."); if (!current) { if (typeof data.token!=="string"||data.token.length<40) throw new Error("The Worker did not return the one-time source token."); showInboundWebhookToken(source,data.token); } await loadInboundWebhookSources(true); }); closeInboundWebhookSourceForm(Boolean(current)); showToast(current?"Webhook source updated":"Webhook source created — save its token now"); }
      catch(error) { showError("inboundWebhookSourceFormError",error); showToast(error.message,"error"); }
    }
    async function rotateInboundWebhookToken(source,button) {
      if (!window.confirm("Rotate the token for ‘"+source.name+"’? The existing token stops working immediately.")) return; clearError("inboundWebhookSourceNotice"); try { await runBusy(button,"Rotating…",async()=>{ const data=await api("/api/v1/inbound-webhook-sources/"+encodeURIComponent(source.id)+"/rotate-token",{method:"POST",body:JSON.stringify({version:source.version})}); if (!validInboundWebhookSource(data&&data.source)||typeof data.token!=="string"||data.token.length<40) throw new Error("The Worker returned an invalid rotated token."); showInboundWebhookToken(data.source,data.token); await loadInboundWebhookSources(true); }); showToast("Source token rotated — save it now"); } catch(error) { if (error&&error.status===409) await loadInboundWebhookSources(true); showError("inboundWebhookSourceNotice",error); showToast(error.message,"error"); }
    }
    function capturePointers(value,base="",out=[]){ if (value===null||typeof value!=="object") { if(base) out.push(base); return out; } if(Array.isArray(value)) value.forEach((item,index)=>capturePointers(item,base+"/"+index,out)); else Object.entries(value).forEach(([key,item])=>capturePointers(item,base+"/"+key.replaceAll("~","~0").replaceAll("/","~1"),out)); return out; }
    function captureFieldName(pointer,used){ const parts=pointer.split("/").slice(1).filter((part)=>!/^\\d+$/.test(part)).map((part)=>part.replaceAll("~1","/").replaceAll("~0","~").replace(/[^A-Za-z0-9]+/g," ").trim()).filter(Boolean); let name=parts.map((part,index)=>index===0?part.charAt(0).toLowerCase()+part.slice(1):part.charAt(0).toUpperCase()+part.slice(1)).join("")||"value"; if(!/^[A-Za-z_]/.test(name)) name="value"+name; const base=name; let suffix=2; while(used.has(name)) name=base+suffix++; used.add(name); return name; }
    async function captureInboundWebhook(source,button) { try { await runBusy(button,"Arming…",async()=>{ await api("/api/v1/inbound-webhook-sources/"+encodeURIComponent(source.id)+"/capture",{method:"POST"}); }); showToast("Capture armed — it stays active until the next request"); const poll=async()=>{ const data=await api("/api/v1/inbound-webhook-sources/"+encodeURIComponent(source.id)+"/capture"); if(data&&data.captured&&typeof data.payload==="string"){ let payload; try { payload=JSON.parse(data.payload); } catch { payload={}; } const pointers=capturePointers(payload).slice(0,50); const used=new Set(); const pre=node("pre",JSON.stringify(payload,null,2),"capture-preview"); pre.style.maxHeight="360px"; pre.style.overflow="auto"; const title=node("h3","Captured webhook fields"); const info=node("p","Select Save fields to load "+pointers.length+" detected JSON paths into the source mapping editor."); const dialog=document.createElement("dialog"); const save=node("button","Save fields","btn btn-primary primary small"); save.type="button"; save.onclick=()=>{ dialog.close(); openInboundWebhookSourceForm(source,button); byId("inboundWebhookMappings").value=pointers.map((pointer)=>captureFieldName(pointer,used)+" = "+pointer).join("\n"); }; const close=node("button","Close","btn small"); close.type="button"; close.onclick=()=>dialog.close(); dialog.append(title,info,pre,save,close); document.body.append(dialog); dialog.showModal(); return; } setTimeout(poll,2000); }; poll().catch(error=>showToast(error.message,"error")); } catch(error) { showToast(error.message,"error"); } }
    async function deleteInboundWebhookSource(source,button) {
      if (!window.confirm("Delete webhook source ‘"+source.name+"’? Its endpoint and token stop working immediately.")) return; clearError("inboundWebhookSourceNotice"); try { await runBusy(button,"Deleting…",async()=>{ await api("/api/v1/inbound-webhook-sources/"+encodeURIComponent(source.id),{method:"DELETE",body:JSON.stringify({version:source.version})}); await loadInboundWebhookSources(true); }); showToast("Webhook source deleted"); } catch(error) { if (error&&error.status===409) await loadInboundWebhookSources(true); showError("inboundWebhookSourceNotice",error); showToast(error.message,"error"); }
    }
    async function copyInboundWebhookToken() { const value=byId("inboundWebhookTokenValue").textContent; try { await navigator.clipboard.writeText(value); showToast("Source token copied"); } catch { showError("inboundWebhookSourceNotice",new Error("Could not copy automatically. Select the token and copy it manually.")); } }

    function validWebhook(webhook) {
      return webhook&&typeof webhook.id==="string"&&typeof webhook.name==="string"&&typeof webhook.url==="string"&&typeof webhook.enabled==="boolean"&&Number.isSafeInteger(webhook.version)&&webhook.version>=0&&typeof webhook.createdAt==="string"&&typeof webhook.updatedAt==="string";
    }
    function parseWebhooksResponse(data) {
      const capability=data&&data.capability; const items=data&&data.webhooks;
      if (!Array.isArray(items)||!items.every(validWebhook)||!capability||typeof capability.configured!=="boolean"||!Array.isArray(capability.allowedHosts)||!capability.allowedHosts.every((host)=>typeof host==="string")||typeof capability.signingConfigured!=="boolean") throw new Error("The Worker returned an invalid webhook directory.");
      return {webhooks:items,capability};
    }
    function webhookPostureItem(label,value,className) { const item=node("div",undefined,"posture-item"+(className?" "+className:"")); item.append(node("span",label,"detail-label"),node("strong",value)); return item; }
    function renderWebhookPosture() {
      const posture=byId("webhookPosture"); posture.textContent=""; const capability=webhookCapability;
      if (!capability) { posture.append(webhookPostureItem("Registration","Not loaded"),webhookPostureItem("Signing","Not loaded"),webhookPostureItem("Allowed hosts","Not loaded","allowed-hosts")); return; }
      posture.append(webhookPostureItem("Registration",capability.configured?"Configured":"Configuration required"),webhookPostureItem("Signing",capability.signingConfigured?"HMAC signing configured":"Signing not configured"),webhookPostureItem("Allowed hosts",capability.allowedHosts.length?capability.allowedHosts.join(", "):"No hosts configured","allowed-hosts"));
    }
    function resetWebhookForm() {
      editingWebhookId=null; byId("webhookForm").classList.add("hidden"); setText("webhookFormHeading","Add destination"); setText("webhookFormMode","New"); byId("webhookName").value=""; byId("webhookUrl").value=""; byId("webhookEnabled").checked=true; clearError("webhookFormError");
    }
    function resetWebhooks() {
      webhooks=[]; webhookCapability=null; webhooksLoaded=false; webhooksLoading=false; webhookActionDestinationPreference=""; resetWebhookForm(); renderWebhookPosture(); byId("addWebhook").disabled=true;
      const list=byId("webhookList"); list.textContent=""; list.removeAttribute("aria-busy"); list.append(emptyState("WH","Destinations not loaded","Open Setup to load registered webhook destinations.")); clearError("webhookNotice");
      populateWebhookDestinationSelect();
    }
    function renderWebhooks() {
      renderWebhookPosture(); const list=byId("webhookList"); list.textContent=""; list.removeAttribute("aria-busy"); const configured=webhookCapability?.configured===true; byId("addWebhook").disabled=!configured;
      if (!webhooks.length) { list.append(emptyState("WH",configured?"No webhook destinations":"Webhook registration is not configured",configured?"Add an allow-listed HTTPS destination for a parser action.":"Configure the server-side host allow-list and signing secret, then refresh Setup.",configured?"Add destination":undefined,configured?()=>openWebhookForm(null):undefined)); return; }
      webhooks.forEach((webhook)=>{
        const row=node("article",undefined,"webhook-row"); const heading=node("div",undefined,"webhook-row-heading"); const copy=node("div"); copy.append(node("h4",webhook.name),node("span",webhook.url,"webhook-url"),node("p","Updated "+formatDate(webhook.updatedAt))); heading.append(copy); row.append(heading);
        const actions=node("div",undefined,"webhook-actions"); actions.append(node("span",webhook.enabled?"Enabled":"Disabled","setup-state "+(webhook.enabled?"ready":"optional")));
        const toggle=node("button",webhook.enabled?"Disable":"Enable","btn small"); toggle.type="button"; toggle.onclick=()=>toggleWebhook(webhook,toggle);
        const edit=node("button","Edit","btn small"); edit.type="button"; edit.onclick=()=>openWebhookForm(webhook);
        const remove=node("button","Delete","btn danger small"); remove.type="button"; remove.onclick=()=>deleteWebhook(webhook,remove); actions.append(toggle,edit,remove); row.append(actions); list.append(row);
      });
      populateWebhookDestinationSelect(); if (rulesCache.length) renderRules();
    }
    async function loadWebhooks(force=false) {
      if (webhooksLoading||(!force&&webhooksLoaded)) return;
      webhooksLoading=true; clearError("webhookNotice"); loading(byId("webhookList")); byId("addWebhook").disabled=true;
      try { const result=parseWebhooksResponse(await api("/api/v1/webhooks")); webhooks=result.webhooks; webhookCapability=result.capability; webhooksLoaded=true; renderWebhooks(); }
      catch(error) { webhooksLoaded=false; webhookCapability=null; renderWebhookPosture(); const list=byId("webhookList"); list.textContent=""; list.removeAttribute("aria-busy"); list.append(emptyState("!","Webhooks unavailable","Mail routing remains available. Refresh this panel after the optional webhook endpoint is configured.","Retry",()=>loadWebhooks(true))); showError("webhookNotice",error); }
      finally { webhooksLoading=false; populateWebhookDestinationSelect(); }
    }
    function openWebhookForm(webhook) {
      if (!webhookCapability?.configured) return;
      editingWebhookId=webhook?.id||null; setText("webhookFormHeading",webhook?"Edit destination":"Add destination"); setText("webhookFormMode",webhook?"Editing":"New"); byId("webhookName").value=webhook?.name||""; byId("webhookUrl").value=webhook?.url||""; byId("webhookEnabled").checked=webhook?webhook.enabled:true; clearError("webhookFormError"); byId("webhookForm").classList.remove("hidden"); byId("webhookName").focus();
    }
    function closeWebhookForm() { resetWebhookForm(); byId("addWebhook").focus(); }
    function parseWebhookInput() {
      const name=byId("webhookName").value.trim(); const url=byId("webhookUrl").value.trim();
      if (!name||name.length>120||/[\u0000-\u001f\u007f]/.test(name)) throw new Error("Enter a destination name without control characters.");
      let parsed; try { parsed=new URL(url); } catch { throw new Error("Enter a valid HTTPS webhook URL."); }
      if (parsed.protocol!=="https:") throw new Error("Webhook destinations must use HTTPS.");
      if (parsed.username||parsed.password) throw new Error("Webhook URLs cannot contain credentials.");
      if (parsed.hash) throw new Error("Remove the URL fragment; fragments are not sent with webhook requests.");
      return {name,url,enabled:byId("webhookEnabled").checked};
    }
    async function saveWebhook() {
      clearError("webhookFormError"); if (!byId("webhookForm").reportValidity()) return;
      let input; try { input=parseWebhookInput(); } catch(error) { showError("webhookFormError",error); return; }
      const current=editingWebhookId?webhooks.find((webhook)=>webhook.id===editingWebhookId):null; if (editingWebhookId&&!current) { showError("webhookFormError",new Error("This destination changed. Refresh Setup and try again.")); return; }
      try {
        await runBusy(byId("saveWebhook"),"Saving…",async()=>{ const path=current?"/api/v1/webhooks/"+encodeURIComponent(current.id):"/api/v1/webhooks"; const body=current?{version:current.version,...input}:input; const data=await api(path,{method:current?"PUT":"POST",body:JSON.stringify(body)}); if (!validWebhook(data&&data.webhook)) throw new Error("The Worker returned an invalid webhook destination."); await loadWebhooks(true); });
        resetWebhookForm(); showToast(current?"Webhook destination updated":"Webhook destination added");
      } catch(error) { showError("webhookFormError",error); showToast(error.message,"error"); }
    }
    async function toggleWebhook(webhook,button) {
      clearError("webhookNotice");
      try { await runBusy(button,webhook.enabled?"Disabling…":"Enabling…",async()=>{ const data=await api("/api/v1/webhooks/"+encodeURIComponent(webhook.id),{method:"PUT",body:JSON.stringify({version:webhook.version,name:webhook.name,url:webhook.url,enabled:!webhook.enabled})}); if (!validWebhook(data&&data.webhook)) throw new Error("The Worker returned an invalid webhook destination."); await loadWebhooks(true); }); showToast(webhook.enabled?"Webhook destination disabled":"Webhook destination enabled"); }
      catch(error) { showError("webhookNotice",error); showToast(error.message,"error"); }
    }
    async function deleteWebhook(webhook,button) {
      if (!window.confirm("Delete this webhook destination? Parser actions using it will require another destination.")) return;
      clearError("webhookNotice");
      try { await runBusy(button,"Deleting…",async()=>{ await api("/api/v1/webhooks/"+encodeURIComponent(webhook.id)+"?version="+encodeURIComponent(String(webhook.version)),{method:"DELETE"}); if (editingWebhookId===webhook.id) resetWebhookForm(); await loadWebhooks(true); }); showToast("Webhook destination deleted"); }
      catch(error) { showError("webhookNotice",error); showToast(error.message,"error"); }
    }
    async function loadSetupExtensions(force=false) { await Promise.allSettled([loadMailboxes(force),loadClientDirectory(force),loadWebhooks(force),loadInboundWebhookSources(force)]); populateInboundWebhookOptions(); }

    function isAuthenticated() { return !byId("workspace").classList.contains("hidden"); }
    function isEditableTarget(target) { return target instanceof HTMLElement && (target.matches("input,textarea,select")||target.isContentEditable); }
    function focusAfterTab(tab,id) { Promise.resolve(showTab(tab,false)).then(()=>setTimeout(()=>byId(id).focus(),0)); }
    function refreshCurrentView() {
      const tab=currentTabButton()?.dataset.tab||"rules";
      const controls={rules:"refreshRules",quarantine:"refreshQuarantine",audit:"refreshEvents",setup:"refreshSetup"};
      if (controls[tab]) byId(controls[tab]).click(); else if (tab==="test") byId("runTest").focus();
    }
    function commandDefinitions() {
      return [
        {id:"go-rules",group:"Navigate",label:"Routing rules",description:"Review and edit first-match mail policies",icon:"rules",key:"R",run:()=>showTab("rules",true)},
        {id:"go-quarantine",group:"Navigate",label:"Quarantine review",description:"Inspect held originals and record dispositions",icon:"quarantine",key:"Q",run:()=>showTab("quarantine",true)},
        {id:"go-audit",group:"Navigate",label:"Message audit",description:"Trace processing and delivery evidence",icon:"audit",key:"A",run:()=>showTab("audit",true)},
        {id:"go-test",group:"Navigate",label:"Dry run",description:"Evaluate a message without delivering it",icon:"test",key:"T",run:()=>showTab("test",true)},
        {id:"go-setup",group:"Navigate",label:"Setup readiness",description:"Check Cloudflare, Gorelo, clients, and webhooks",icon:"setup",key:"S",run:()=>showTab("setup",true)},
        {id:"new-rule",group:"Actions",label:"Create routing rule",description:"Open the guided policy composer",icon:"plus",key:"N",run:()=>{ showTab("rules",false); openEditor(null,byId("commandTrigger")); }},
        {id:"refresh-view",group:"Actions",label:"Refresh current view",description:"Reload the active workspace from the Worker",icon:"refresh",key:"F",run:refreshCurrentView},
        {id:"search-quarantine",group:"Actions",label:"Search quarantine",description:"Open review and focus message search",icon:"search",run:()=>focusAfterTab("quarantine","quarantineSearch")},
        {id:"search-audit",group:"Actions",label:"Search message audit",description:"Open the ledger and focus event search",icon:"search",run:()=>focusAfterTab("audit","eventSearch")}
      ];
    }
    function setCommandSelection(index) {
      const buttons=[...byId("commandList").querySelectorAll("button[data-command-id]")];
      if (!buttons.length) { commandSelection=0; byId("commandSearch").removeAttribute("aria-activedescendant"); return; }
      commandSelection=(index+buttons.length)%buttons.length;
      buttons.forEach((button,itemIndex)=>{ const selected=itemIndex===commandSelection; button.setAttribute("aria-selected",String(selected)); button.tabIndex=selected?0:-1; });
      const selected=buttons[commandSelection]; byId("commandSearch").setAttribute("aria-activedescendant",selected.id); selected.scrollIntoView({block:"nearest"});
    }
    function renderCommands() {
      const query=byId("commandSearch").value.trim().toLocaleLowerCase();
      visibleCommands=commandDefinitions().filter((command)=>!query||(command.label+" "+command.description+" "+command.group).toLocaleLowerCase().includes(query));
      const list=byId("commandList"); list.textContent="";
      if (!visibleCommands.length) { const empty=node("li","No matching commands. Try a page name or action.","command-empty"); list.append(empty); byId("commandSearch").removeAttribute("aria-activedescendant"); return; }
      let group="";
      visibleCommands.forEach((command,index)=>{
        if (command.group!==group) { group=command.group; const heading=node("li",group,"command-group"); heading.setAttribute("aria-hidden","true"); list.append(heading); }
        const item=node("li",undefined,"command-item"); const button=node("button",undefined,"command-button"); button.type="button"; button.id="commandOption"+String(index); button.dataset.commandId=command.id; button.setAttribute("aria-selected","false");
        const mark=node("span",undefined,"command-icon"); mark.setAttribute("aria-hidden","true"); mark.append(iconNode(command.icon));
        const copy=node("span",undefined,"command-copy"); copy.append(node("strong",command.label),node("span",command.description)); button.append(mark,copy);
        if (command.key) button.append(node("span",command.key,"command-key"));
        button.onclick=()=>runCommand(command); item.append(button); list.append(item);
      });
      setCommandSelection(Math.min(commandSelection,visibleCommands.length-1));
    }
    function openCommandMenu(invoker) {
      if (!isAuthenticated()) return;
      const activeDialog=document.querySelector("dialog[open]"); if (activeDialog&&activeDialog!==byId("commandDialog")) return;
      commandInvoker=invoker||document.activeElement; commandRestoreFocus=true; commandSelection=0; byId("commandSearch").value=""; renderCommands();
      if (!byId("commandDialog").open) byId("commandDialog").showModal(); byId("commandSearch").focus();
    }
    function closeCommandMenu() { if (byId("commandDialog").open) byId("commandDialog").close(); }
    function runCommand(command) { commandRestoreFocus=false; closeCommandMenu(); setTimeout(()=>command.run(),0); }
    function handleCommandKeys(event) {
      const buttons=[...byId("commandList").querySelectorAll("button[data-command-id]")];
      if (event.key==="ArrowDown") { event.preventDefault(); setCommandSelection(commandSelection+1); }
      else if (event.key==="ArrowUp") { event.preventDefault(); setCommandSelection(commandSelection-1); }
      else if (event.key==="Enter") { event.preventDefault(); if (visibleCommands[commandSelection]) runCommand(visibleCommands[commandSelection]); }
      else if (event.key==="Escape") { event.preventDefault(); closeCommandMenu(); }
      else if (event.key==="Tab"&&buttons.length) setCommandSelection(event.shiftKey?commandSelection-1:commandSelection+1);
    }
    function handleGlobalShortcuts(event) {
      if (event.isComposing||event.repeat) return;
      if ((event.metaKey||event.ctrlKey)&&event.key.toLocaleLowerCase()==="k") { if (!isAuthenticated()) return; event.preventDefault(); if (byId("commandDialog").open) closeCommandMenu(); else openCommandMenu(document.activeElement); return; }
      if (event.key==="/"&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!isEditableTarget(event.target)&&isAuthenticated()) { event.preventDefault(); openCommandMenu(document.activeElement); }
    }

    function currentTabButton() { return document.querySelector('[role="tab"][aria-selected="true"]'); }
    function syncTabIndicator(animate=true) {
      const tabs=byId("primaryTabs"); const selected=currentTabButton(); if (!tabs||!selected||!isAuthenticated()) return;
      tabs.style.setProperty("--indicator-x",selected.offsetLeft+"px"); tabs.style.setProperty("--indicator-scale",String(selected.offsetWidth)); tabs.dataset.indicatorReady="true";
      const target=Math.max(0,selected.offsetLeft-(tabs.clientWidth-selected.offsetWidth)/2); tabs.scrollTo({left:target,behavior:animate&&!reducedMotion()?"smooth":"auto"});
    }
    function showTab(name,focusHeading) {
      const requestSequence=++tabChangeSequence;
      const update=()=>["rules","quarantine","audit","test","setup"].forEach((tab)=>{
        const button=byId(tab+"TabButton"); const panel=byId(tab+"Tab"); const selected=tab===name;
        button.setAttribute("aria-selected",String(selected)); button.classList.toggle("active",selected); button.tabIndex=selected?0:-1; panel.classList.toggle("hidden",!selected); panel.classList.toggle("active-panel",selected);
      });
      const apply=()=>{ update(); syncTabIndicator(); };
      apply(); const finished=Promise.resolve();
      if (name==="quarantine" && !quarantineCache.length) loadQuarantine();
      if (name==="audit") { if (!eventsCache.length) loadEvents(); void loadParserCaptures(); }
      if (name==="setup") void loadSetupExtensions();
      if (focusHeading) finished.then(()=>{ if (requestSequence===tabChangeSequence) byId(name+"Heading").focus(); });
      return finished;
    }
    function handleTabKeys(event) {
      const tabs=[...document.querySelectorAll('[role="tab"]')]; const current=tabs.indexOf(event.currentTarget); let next=current;
      if (event.key==="ArrowRight") next=(current+1)%tabs.length; else if (event.key==="ArrowLeft") next=(current-1+tabs.length)%tabs.length; else if (event.key==="Home") next=0; else if (event.key==="End") next=tabs.length-1; else return;
      event.preventDefault(); tabs[next].focus(); showTab(tabs[next].dataset.tab,false);
    }
    function forceDisconnect(message) {
      uiTransitionSequence+=1; if (activeUiTransition) activeUiTransition.skipTransition(); activeUiTransition=null;
      testRequestVersion+=1; resetTestResult(); clearError("testError");
      stopCapturePoll(); activeParserCapture=null; parserRuleSample=null; parserRuleEvent=null; parserRuleInvoker=null; if (byId("parserRuleDialog").open) byId("parserRuleDialog").close();
      closeTemplateTrainer(true,false);
      if (byId("reviewDialog").open) byId("reviewDialog").close();
      if (byId("clientAliasDialog").open) byId("clientAliasDialog").close();
      if (byId("commandDialog").open) byId("commandDialog").close(); byId("commandSearch").value=""; commandInvoker=null; visibleCommands=[];
      if (eventSearchTimer!==null) clearTimeout(eventSearchTimer); if (quarantineSearchTimer!==null) clearTimeout(quarantineSearchTimer); eventSearchTimer=null; quarantineSearchTimer=null; eventsRequestVersion+=1; quarantineRequestVersion+=1;
      closeEditor(true,false); token=""; byId("token").value=""; editingId=null; editorDirty=false; editorReturnFocus=null; rulesCache=[]; eventsCache=[]; eventsCursor=null; quarantineCache=[]; quarantineCursor=null; quarantineSummary={pending:0,releaseFailed:0,released:0,dismissed:0}; runtimeConfig=null; setupState=null; goreloTestState=null; selectedQuarantineId=null; reviewAction=null; reviewEvent=null; auditDetailsCache.clear(); goreloCatalogs.clear(); goreloCatalogLoads.clear(); goreloActionPreferences=null; lastRefresh=null;
      byId("rules").textContent=""; byId("events").textContent=""; byId("quarantineList").textContent=""; renderQuarantineDetail(null); resetSetupView(); resetMailboxes(); resetClientDirectory(); resetWebhooks(); resetInboundWebhookSources(); renderCaptureBanner(); updateSummary();
      byId("primaryTabs").dataset.indicatorReady="false"; byId("workspace").classList.add("hidden"); byId("sessionControls").classList.add("hidden"); byId("login").classList.remove("hidden"); byId("loginError").textContent=message||""; showTab("rules",false); byId("token").focus();
    }
    function disconnect() { if (!confirmDiscard()) return; forceDisconnect(""); }
    async function connect() {
      clearError("loginError"); token=byId("token").value.trim(); if (!token) { showError("loginError",new Error("Enter the admin token.")); byId("token").focus(); return; }
      try {
        await runBusy(byId("connect"),"Checking Worker…",async()=>{
          await api("/api/v1/readiness");
          const [rulesData,eventsData,runtimeData,quarantineData,setupData]=await Promise.all([api("/api/v1/rules"),api("/api/v1/events?status=all&limit="+String(RETAINED_MESSAGE_PAGE_SIZE)),api("/api/v1/runtime"),api("/api/v1/quarantine?state=all&limit="+String(RETAINED_MESSAGE_PAGE_SIZE)),fetchSetup()]);
          rulesCache=Array.isArray(rulesData.rules)?rulesData.rules:[]; eventsCache=Array.isArray(eventsData.events)?eventsData.events:[]; eventsCursor=pageCursor(eventsData.nextCursor); runtimeConfig=runtimeData.runtime; quarantineCache=Array.isArray(quarantineData.items)?quarantineData.items:[]; quarantineCursor=pageCursor(quarantineData.nextCursor); quarantineSummary=quarantineData.summary||{pending:0,releaseFailed:0,released:0,dismissed:0}; setupState=setupData; goreloTestState=null;
        });
        byId("token").value=""; byId("login").classList.add("hidden"); byId("workspace").classList.remove("hidden"); byId("sessionControls").classList.remove("hidden"); lastRefresh=new Date(); renderRuntime(); renderRules(); renderEvents(); renderQuarantine(); renderSetup(setupState); updateSummary(); showTab("rules",false); byId("workspaceTitle").focus(); showToast("Connected to Gorelo Router"); void loadSetupExtensions(); void loadParserCaptures();
      } catch(error) { token=""; setupState=null; goreloTestState=null; resetSetupView(); showError("loginError",error); byId("token").focus(); }
    }

    byId("testFrom").value="alerts@vendor.example"; byId("testTo").value="support@alerts.example.net"; byId("testSubject").value="Server offline"; byId("testBody").value="Monitoring detected an outage."; byId("testRawSize").value="2048"; byId("testHeaders").value=JSON.stringify({"message-id":"<dry-run@example>"},null,2);
    byId("loginForm").onsubmit=(event)=>{ event.preventDefault(); connect(); };
    byId("disconnect").onclick=disconnect;
    byId("commandTrigger").onclick=(event)=>openCommandMenu(event.currentTarget);
    byId("commandClose").onclick=closeCommandMenu;
    byId("commandSearch").oninput=()=>{ commandSelection=0; renderCommands(); };
    byId("commandSearch").onkeydown=handleCommandKeys;
    byId("commandForm").onsubmit=(event)=>{ event.preventDefault(); if (visibleCommands[commandSelection]) runCommand(visibleCommands[commandSelection]); };
    byId("commandDialog").onclick=(event)=>{ if (event.target===byId("commandDialog")) closeCommandMenu(); };
    byId("commandDialog").addEventListener("close",()=>{ const invoker=commandInvoker; const restore=commandRestoreFocus; commandInvoker=null; commandRestoreFocus=true; if (restore&&invoker&&document.contains(invoker)) requestAnimationFrame(()=>invoker.focus()); });
    document.addEventListener("keydown",handleGlobalShortcuts);
    document.querySelectorAll('[role="tab"]').forEach((button)=>{ button.onclick=()=>showTab(button.dataset.tab,true); button.onkeydown=handleTabKeys; });
    byId("refreshRules").onclick=()=>runBusy(byId("refreshRules"),"Refreshing…",loadRules);
    byId("newRule").onclick=(event)=>openEditor(null,event.currentTarget);
    byId("loadAuditSample").onclick=()=>openAuditSamplePicker(byId("loadAuditSample"));
    byId("saveRule").onclick=saveRule;
    byId("cancelEdit").onclick=()=>closeEditor(false);
    byId("builderMode").onclick=()=>setEditorMode("builder"); byId("jsonMode").onclick=()=>setEditorMode("json");
    byId("addCondition").onclick=()=>{ addConditionRow(); editorDirty=true; };
    byId("actionType").onchange=()=>{ lastGoreloTemplateTarget=null; updateActionFields(); editorDirty=true; }; byId("actionMailboxId").onchange=()=>{ editorDirty=true; }; byId("bypassSpam").onchange=()=>{ updateActionFields(); editorDirty=true; };
    byId("teachParser").onclick=(event)=>openTemplateTrainer(event.currentTarget); byId("addWebhookField").onclick=()=>{ addWebhookFieldRow(); editorDirty=true; }; byId("ruleWebhookDestination").onchange=()=>{ webhookActionDestinationPreference=byId("ruleWebhookDestination").value; editorDirty=true; };
    byId("refreshRuleWebhooks").onclick=()=>runBusy(byId("refreshRuleWebhooks"),"Refreshing…",async()=>{ await ensureWebhookActionDestinations(true); if (webhooksLoaded) showToast("Webhook destinations refreshed"); });
    byId("clientIdentityField").onchange=()=>{ updateClientLinkageFields(); editorDirty=true; };
    byId("goreloClientMode").onchange=()=>{ updateGoreloAssignmentControls(true); populateGoreloCatalogControls(); updateGoreloClientLinkage(); if (byId("goreloClientMode").value==="fixed") void ensureGoreloClientCatalogs(); editorDirty=true; };
    byId("goreloClientId").onchange=()=>{ ["ticketLocationId","ticketContactId","ticketCcContactIds","ticketAgentAssetIds"].forEach((id)=>{ [...byId(id).options].forEach((option)=>{ option.selected=false; }); }); populateGoreloCatalogControls(); void ensureGoreloClientCatalogs(); editorDirty=true; }; byId("goreloClientIdentityField").onchange=()=>{ updateGoreloClientLinkage(); editorDirty=true; }; byId("goreloClientAliasScope").oninput=()=>{ editorDirty=true; };
    goreloAssignmentDefinitions.forEach((definition)=>{ byId(definition.modeId).onchange=()=>{ updateGoreloAssignmentControls(); editorDirty=true; }; });
    byId("refreshGoreloCatalogs").onclick=()=>runBusy(byId("refreshGoreloCatalogs"),"Refreshing…",async()=>{ await ensureGoreloActionCatalogs(true); showToast("Gorelo clients and catalogs refreshed"); });
    byId("goreloActionConfig").addEventListener("focusin",(event)=>{ if (event.target&&Object.hasOwn(goreloTemplateLabels,event.target.id)) { lastGoreloTemplateTarget=event.target; renderGoreloVariableBar(); } });
    byId("ruleForm").addEventListener("input",()=>{ editorDirty=true; }); byId("ruleForm").addEventListener("change",()=>{ editorDirty=true; }); byId("ruleJson").addEventListener("input",()=>{ editorDirty=true; });
    byId("applyTemplate").onclick=()=>{ if (!confirmDiscard()) return; const input=deepCopy(templates[byId("template").value]); populateBuilder(input); byId("ruleJson").value=JSON.stringify(input,null,2); editorDirty=true; showToast("Template applied"); };
    byId("refreshQuarantine").onclick=()=>runBusy(byId("refreshQuarantine"),"Refreshing…",loadQuarantine);
    byId("loadMoreQuarantine").onclick=()=>runBusy(byId("loadMoreQuarantine"),"Loading…",()=>loadQuarantine(undefined,true));
    byId("quarantineSearch").oninput=scheduleQuarantineSearch; byId("quarantineState").onchange=()=>loadQuarantine();
    byId("refreshEvents").onclick=()=>runBusy(byId("refreshEvents"),"Refreshing…",loadEvents);
    byId("loadMoreEvents").onclick=()=>runBusy(byId("loadMoreEvents"),"Loading…",()=>loadEvents(true));
    byId("eventSearch").oninput=scheduleEventSearch; byId("eventStatus").onchange=()=>loadEvents();
    byId("auditEmailsTab").onclick=()=>setAuditStream("emails"); byId("auditWebhooksTab").onclick=()=>setAuditStream("webhooks");
    byId("testForm").onsubmit=(event)=>{ event.preventDefault(); runTest(); };
    byId("testForm").oninput=()=>{ const result=byId("testResult"); if (result.classList.contains("has-result")||result.classList.contains("has-error")) { clearError("testError"); resetTestResult(); } };
    byId("refreshSetup").onclick=()=>runBusy(byId("refreshSetup"),"Refreshing…",async()=>{ try { await loadSetup(); await loadSetupExtensions(true); showToast("Setup status refreshed"); } catch(error) { showToast(error.message,"error"); } });
    byId("testGorelo").onclick=testGoreloConnection; byId("copySetupCommand").onclick=copySetupCommand;
    byId("addMailbox").onclick=()=>openMailboxForm(null); byId("cancelMailbox").onclick=closeMailboxForm; byId("mailboxForm").onsubmit=(event)=>{ event.preventDefault(); saveMailbox(); };
    byId("importGoreloClients").onclick=importGoreloClients; byId("clientSearch").oninput=renderClientDirectory; byId("clientAliasForm").onsubmit=(event)=>{ event.preventDefault(); addClientAliases(); }; byId("clientResolutionForm").onsubmit=(event)=>{ event.preventDefault(); previewClientResolution(); };
    byId("clientAliasEditForm").onsubmit=(event)=>{ event.preventDefault(); saveClientAliasEdit(); }; byId("cancelClientAliasEdit").onclick=closeClientAliasEditor; byId("clientAliasDialog").addEventListener("close",()=>{ editingClientAlias=null; clearError("clientAliasDialogError"); });
    byId("addWebhook").onclick=()=>openWebhookForm(null); byId("cancelWebhook").onclick=closeWebhookForm; byId("webhookForm").onsubmit=(event)=>{ event.preventDefault(); saveWebhook(); };
    byId("addInboundWebhookSource").onclick=(event)=>openInboundWebhookSourceForm(null,event.currentTarget); byId("cancelInboundWebhookSource").onclick=()=>closeInboundWebhookSourceForm(); byId("inboundWebhookSourceForm").onsubmit=(event)=>{ event.preventDefault(); saveInboundWebhookSource(); }; byId("inboundWebhookSourceAction").onchange=updateInboundWebhookActionFields; byId("copyInboundWebhookToken").onclick=copyInboundWebhookToken;
    byId("reviewActionForm").onsubmit=(event)=>{ event.preventDefault(); submitReviewAction(); };
    byId("reviewCancel").onclick=()=>byId("reviewDialog").close();
    byId("reviewDialog").addEventListener("close",()=>{ reviewAction=null; reviewEvent=null; clearError("reviewDialogError"); });
    byId("parserRuleForm").onsubmit=(event)=>{ event.preventDefault(); createParserRuleDraft(); }; byId("parserRuleForm").elements.parserOutcome.forEach((input)=>{ input.onchange=renderParserRuleDialog; }); byId("cancelParserRule").onclick=()=>closeParserRuleDialog(); byId("captureNextEmail").onclick=()=>{ const related=activeParserCapture?.sourceEventId===eventKey(parserRuleEvent||{}); if (related&&activeParserCapture?.state==="captured"&&activeParserCapture.sampleAvailable) void teachFromCapturedEmail(byId("captureNextEmail")); else void startParserCapture(); };
    byId("parserRuleDialog").addEventListener("click",(event)=>{ if (event.target===byId("parserRuleDialog")) closeParserRuleDialog(); }); byId("parserRuleDialog").addEventListener("close",()=>{ const invoker=parserRuleInvoker; const restore=parserRuleRestoreFocus; parserRuleSample=null; parserRuleEvent=null; parserRuleInvoker=null; parserRuleRestoreFocus=true; clearError("parserRuleError"); if (restore&&invoker&&document.contains(invoker)) requestAnimationFrame(()=>invoker.focus()); });
    Object.values(trainerSourceControls).forEach((id)=>{ const control=byId(id); control.addEventListener("select",()=>captureTrainerSelection(control)); control.addEventListener("keyup",()=>captureTrainerSelection(control)); control.addEventListener("pointerup",()=>captureTrainerSelection(control)); control.addEventListener("input",()=>handleTrainerSampleInput(control)); });
    byId("trainerKey").addEventListener("input",()=>{ clearError("trainerError"); updateTrainerControls(); }); byId("trainerKey").addEventListener("keydown",(event)=>{ if (event.key==="Enter"&&!byId("createTrainerVariable").disabled) { event.preventDefault(); void createTrainerVariable(); } });
    byId("useDryRunSample").onclick=loadDryRunIntoTrainer; byId("createTrainerVariable").onclick=()=>void createTrainerVariable(); byId("applyTrainerVariables").onclick=applyTrainerVariables; byId("closeTemplateTrainer").onclick=()=>closeTemplateTrainer(); byId("cancelTemplateTrainer").onclick=()=>closeTemplateTrainer();
    byId("templateTrainerDialog").addEventListener("cancel",(event)=>{ if (trainerHasWork()&&!confirm("Discard this sample and its taught variables?")) event.preventDefault(); }); byId("templateTrainerDialog").addEventListener("click",(event)=>{ if (event.target===byId("templateTrainerDialog")) closeTemplateTrainer(); }); byId("templateTrainerDialog").addEventListener("close",()=>{ const invoker=trainerInvoker; const restore=trainerRestoreFocus; trainerInvoker=null; trainerRestoreFocus=true; resetTemplateTrainer(); if (restore&&invoker&&document.contains(invoker)) requestAnimationFrame(()=>invoker.focus()); });
    window.addEventListener("resize",()=>syncTabIndicator(false));
    window.addEventListener("beforeunload",(event)=>{ if (editorDirty||trainerHasWork()) { event.preventDefault(); event.returnValue=""; } });
    resetTestResult(); resetSetupView(); resetMailboxes(); resetClientDirectory(); resetWebhooks(); resetInboundWebhookSources(); renderCaptureBanner(); showTab("rules",false);
  </script>
</body>
</html>`;

export function adminResponse(): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const html = ADMIN_HTML.replaceAll("__CSP_NONCE__", nonce);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}
