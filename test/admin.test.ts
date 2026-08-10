import { describe, expect, it } from "vitest";
import { adminResponse } from "../src/admin";

describe("admin dashboard", () => {
  it("serves a locked-down, non-cached HTML shell", async () => {
    const response = adminResponse();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'self'",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "style-src 'self'",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "img-src 'self' data:",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "unsafe-inline",
    );
    const html = await response.text();
    expect(html).toContain("Gorelo Router");
    expect(html).toContain('href="/admin/tabler.css"');
    expect(html).toContain("<span>Quarantine</span>");
    expect(html).toContain("<span>Audit</span>");
    expect(html).toContain('data-tab="setup"');
    expect(html).toContain("<span>Setup</span>");
    expect(html).not.toContain(">Branding<");
    expect(html).not.toContain("/api/v1/branding");
    expect(html).not.toContain("/admin/branding");
    expect(html).toContain('<dialog id="reviewDialog"');
    expect(html).not.toContain("innerHTML");
  });

  it("uses a fixed accessible application theme without customization controls", async () => {
    const html = await adminResponse().text();
    expect(html).toContain("Gorelo Router · Cloudflare Email Automation");
    expect(html).toContain("--brand:#2563eb");
    expect(html).toContain("--navigation:#0b1628");
    expect(html).toContain("--navigation-contrast");
    expect(html).toContain("--brand-text");
    expect(html).toContain("--focus-canvas");
    expect(html).toContain("--focus-navigation");
    expect(html).toContain(
      ".app-header { position:relative; overflow:hidden; color:var(--navigation-contrast); background:var(--navigation);",
    );
    expect(html).not.toContain("brandingForm");
    expect(html).not.toContain("brandingTab");
    expect(html).not.toMatch(/__[A-Z][A-Z0-9_]+__/);
  });

  it("provides an accessible fifth Setup workspace after Dry run", async () => {
    const html = await adminResponse().text();
    const dryRunTab = html.indexOf('id="testTabButton"');
    const setupTab = html.indexOf('id="setupTabButton"');

    expect(dryRunTab).toBeGreaterThan(-1);
    expect(setupTab).toBeGreaterThan(dryRunTab);
    expect(html).toContain(
      'id="setupTabButton" class="nav-link" type="button" role="tab" aria-selected="false" aria-controls="setupTab"',
    );
    expect(html).toContain(
      'id="setupTab" class="hidden" role="tabpanel" aria-labelledby="setupTabButton"',
    );
    expect(html).toContain(
      'id="setupHeading" tabindex="-1">Setup readiness</h2>',
    );
    expect(html).toContain('id="setupNotice" class="error" role="alert"');
    expect(html).toContain('id="goreloTestResult"');
    expect(html).toContain('id="goreloCatalogCounts"');
  });

  it("exposes an additive, accessible operator command menu", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      'id="commandTrigger" class="btn header-button small command-trigger" type="button"',
    );
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-controls="commandDialog"');
    expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
    expect(html).toContain(
      '<dialog id="commandDialog" class="command-dialog" aria-labelledby="commandDialogTitle">',
    );
    expect(html).toContain(
      '<label id="commandDialogTitle" class="visually-hidden" for="commandSearch">',
    );
    expect(html).toContain(
      'id="commandSearch" type="search" autocomplete="off" spellcheck="false" aria-controls="commandList"',
    );
    expect(html).toContain('id="commandList" class="command-list"');
    expect(html).toContain('id="rulesTabButton"');
    expect(html).toContain('id="rulesTab" role="tabpanel"');
  });

  it("keeps command and workspace navigation keyboard-first", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('event.key==="ArrowRight"');
    expect(html).toContain('event.key==="ArrowLeft"');
    expect(html).toContain('event.key==="Home"');
    expect(html).toContain('event.key==="End"');
    expect(html).toContain('event.key==="ArrowDown"');
    expect(html).toContain('event.key==="ArrowUp"');
    expect(html).toContain('event.key==="Enter"');
    expect(html).toContain('event.key==="Escape"');
    expect(html).toContain("event.metaKey||event.ctrlKey");
    expect(html).toContain("isEditableTarget(event.target)");
    expect(html).toContain("requestAnimationFrame(()=>invoker.focus())");
  });

  it("progressively enhances transitions and bypasses them for reduced motion", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('typeof document.startViewTransition!=="function"');
    expect(html).toContain(
      'document.visibilityState!=="visible"||reducedMotion()||typeof document.startViewTransition!=="function"',
    );
    expect(html).toContain("document.startViewTransition(()=>");
    expect(html).toContain("if (sequence===uiTransitionSequence) update()");
    expect(html).toContain("requestSequence===tabChangeSequence");
    expect(html).toContain("@media (prefers-reduced-motion:reduce)");
  });

  it("uses the authenticated setup contracts without collecting Gorelo secrets", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('api("/api/v1/setup/status")');
    expect(html).toContain(
      'api("/api/v1/integrations/gorelo/test",{method:"POST"},25000)',
    );
    expect(html).toContain("fetchSetup()]);");
    expect(html).toContain('new Set(["forward-only","structured-gorelo"])');
    expect(html).toContain('new Set(["ready","optional","missing"])');
    expect(html).toContain('<code id="setupCommand">');
    expect(html).toContain('setText("setupCommand",gorelo.setupCommand)');
    expect(html).toContain("Object.entries(result.catalogCounts)");
    expect(html).not.toMatch(
      /<input[^>]+(?:id|name)="[^"]*(?:gorelo[_ -]?api[_ -]?key|gorelo[_ -]?secret|api[_ -]?key|secret)[^"]*"/i,
    );
    expect(html).not.toContain('id="goreloApiKey"');
    expect(html).not.toContain('name="GORELO_API_KEY"');
  });

  it("imports Gorelo clients and manages grouped exact aliases in atomic batches", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('id="clientDirectoryHeading">Client directory</h3>');
    expect(html).toContain('id="importGoreloClients"');
    expect(html).toContain('id="clientSearch" type="search"');
    expect(html).toContain('id="clientAliasForm"');
    expect(html).toContain('id="clientAliases"');
    expect(html).toContain('id="aliasScope"');
    expect(html).toContain("One literal alias per line, up to 100");
    expect(html).toContain('<dialog id="clientAliasDialog"');
    expect(html).toContain('id="editClientAlias"');
    expect(html).toContain('id="editAliasScope"');
    expect(html).toContain('id="clientResolutionForm"');
    expect(html).toContain('id="clientResolutionIdentity"');
    expect(html).toContain("const CLIENT_DIRECTORY_PAGE_SIZE = 500");
    expect(html).toContain("const CLIENT_DIRECTORY_MAX_CLIENTS = 5000");
    expect(html).toContain("async function fetchClientDirectoryPages()");
    expect(html).toContain(
      '"/api/v1/integrations/gorelo/clients?limit="+String(limit)+"&offset="+String(offset)',
    );
    expect(html).toContain("filtered.slice(0,CLIENT_DIRECTORY_RENDER_LIMIT)");
    expect(html).toContain(
      'api("/api/v1/integrations/gorelo/clients/import",{method:"POST"})',
    );
    expect(html).toContain(
      'api("/api/v1/integrations/gorelo/client-aliases/batch"',
    );
    expect(html).toContain("aliases:aliases.map((alias)=>({alias,scope}))");
    expect(html).toContain(
      'method:"PUT",body:JSON.stringify({alias,scope,version:current.version})',
    );
    expect(html).toContain(
      '"/api/v1/integrations/gorelo/client-aliases/"+encodeURIComponent(alias.id)+"?version="',
    );
    expect(html).toContain(
      'api("/api/v1/integrations/gorelo/client-resolution?"+parameters.toString())',
    );
    expect(html).toContain("client.aliases.every(validClientAlias)");
    expect(html).toContain("aliases.every(safeAliasInput)");
    expect(html).toContain("safeAliasScope(scope)");
    expect(html).toContain("const byScope=new Map()");
    expect(html).toContain('scope==="global"?"Global":scope');
    expect(html).toContain("openClientAliasEditor(client,alias)");
    expect(html).toContain("error&&error.status===409");
    expect(html).toContain('resolution.reason==="stale_alias"');
    expect(html).toContain('typeof client.stale==="boolean"');
    expect(html).toContain("goreloClients.filter((client)=>!client.stale)");
    expect(html).toContain('headingActions.append(node("span","Stale"');
  });

  it("keeps mixed form fields and actions on predictable rows", async () => {
    const html = await adminResponse().text();
    const aliasForm = html.slice(
      html.indexOf('<form id="clientAliasForm"'),
      html.indexOf('<form id="clientResolutionForm"'),
    );

    expect(html).toContain(
      ".form-field { min-width:0; display:grid; align-content:start; gap:6px; }",
    );
    expect(html).toContain(
      ".filter-bar { display:grid; grid-template-columns:minmax(220px,1fr) 180px auto; gap:12px; align-items:end;",
    );
    expect(html).toContain(
      ".filter-bar > button { min-height:42px; height:auto; align-self:end; white-space:nowrap; }",
    );
    expect(html).toContain(
      ".inline-setup-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(130px,.45fr); gap:12px; align-items:start;",
    );
    expect(html).toContain(
      ".alias-resolution-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(130px,.45fr); gap:12px; align-items:start;",
    );
    expect(aliasForm.indexOf('id="aliasClientId"')).toBeLessThan(
      aliasForm.indexOf('id="aliasScope"'),
    );
    expect(aliasForm.indexOf('id="aliasScope"')).toBeLessThan(
      aliasForm.indexOf('id="clientAliases"'),
    );
    expect(aliasForm.indexOf('id="clientAliases"')).toBeLessThan(
      aliasForm.indexOf('id="addClientAlias"'),
    );
    expect(aliasForm).toContain('class="form-field alias-values-field"');
    expect(aliasForm).toContain(
      '<div class="form-actions"><button id="addClientAlias"',
    );
    expect(html).toContain(
      '<div class="form-actions"><button id="previewClientResolution"',
    );
    expect(html).toContain(
      ".inline-setup-form .form-actions button,.alias-resolution-form .form-actions button { width:100%; }",
    );
    expect(html).toContain("@media (min-width:931px) and (max-width:1050px)");
    expect(html).toContain(
      ".editor-controls { width:100%; display:grid; grid-template-columns:1fr; align-items:start; }",
    );
    expect(html).toContain(".editor-controls button { width:100%; }");
  });

  it("registers allow-listed webhook destinations without sending test traffic or handling secrets", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      'id="webhookDestinationsHeading">Webhook destinations</h3>',
    );
    expect(html).toContain('id="webhookPosture"');
    expect(html).toContain('id="webhookForm"');
    expect(html).toContain('id="webhookUrl" type="url"');
    expect(html).toContain('api("/api/v1/webhooks")');
    expect(html).toContain('method:current?"PUT":"POST"');
    expect(html).toContain(
      '"/api/v1/webhooks/"+encodeURIComponent(webhook.id)+"?version="',
    );
    expect(html).toContain('parsed.protocol!=="https:"');
    expect(html).toContain(
      "Promise.allSettled([loadMailboxes(force),loadClientDirectory(force),loadWebhooks(force)])",
    );
    expect(html).toContain('if (name==="setup") void loadSetupExtensions()');
    expect(html).not.toContain("webhookSigningSecret");
    expect(html).not.toContain("webhookApiKey");
    expect(html).not.toContain("/api/v1/webhooks/test");
    expect(html).not.toContain("/api/v1/webhooks/send");
  });

  it("manages named Gorelo mailboxes and a versioned default destination", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('id="goreloMailboxesHeading">Gorelo mailboxes</h3>');
    expect(html).toContain('id="mailboxForm"');
    expect(html).toContain('id="mailboxName"');
    expect(html).toContain('id="mailboxAddress" type="email"');
    expect(html).toContain('id="mailboxEnabled" type="checkbox"');
    expect(html).toContain('id="actionMailboxId"');
    expect(html).toContain('id="reviewMailboxId"');
    expect(html).toContain('api("/api/v1/integrations/gorelo/mailboxes")');
    expect(html).toContain(
      'const body=current?{name,enabled,version:current.version}:{name,address:byId("mailboxAddress").value.trim(),enabled}',
    );
    expect(html).toContain(
      'method:current?"PUT":"POST",body:JSON.stringify(body)',
    );
    expect(html).toContain(
      'api("/api/v1/integrations/gorelo/mailboxes/default",{method:"PUT",body:JSON.stringify({mailboxId:mailbox.id,version:goreloMailboxSettingsVersion})})',
    );
    expect(html).toContain(
      '"/api/v1/integrations/gorelo/mailboxes/"+encodeURIComponent(mailbox.id)+"?version="+encodeURIComponent(String(mailbox.version)),{method:"DELETE"}',
    );
    expect(html).toContain('byId("mailboxAddress").disabled=Boolean(mailbox)');
    expect(html).toContain(
      'if (route.startsWith("legacy:")) action.destination=route.slice(7); else if (route) action.mailboxId=route',
    );
    expect(html).toContain(
      'if (reviewAction==="release") body.mailboxId=byId("reviewMailboxId").value',
    );
  });

  it("configures forward and signed webhook actions in the guided rule builder", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      '<option value="forward_webhook">Forward + signed webhook</option>',
    );
    expect(html).toContain('id="webhookActionConfig"');
    expect(html).toContain('id="ruleWebhookDestination"');
    expect(html).toContain('id="webhookEventType"');
    expect(html).toContain('id="webhookFields"');
    expect(html).toContain('id="addWebhookField"');
    expect(html).toContain('id="clientIdentityField"');
    expect(html).toContain('id="clientAliasScope"');
    expect(html).toContain(
      '["message_id","Message ID"],["header","Header value"],["literal","Fixed text"]',
    );
    expect(html).toContain('data-role="webhook-header-name"');
    expect(html).toContain('data-role="webhook-literal-value"');
    expect(html).toContain('data-role="webhook-start-after"');
    expect(html).toContain('data-role="webhook-end-before"');
    expect(html).toContain('data-role="webhook-case"');
    expect(html).toContain('data-role="webhook-required"');
    expect(html).toContain('data-role="webhook-default"');
    expect(html).toContain('data-role="webhook-max-characters"');
    expect(html).toContain("container.children.length>=50");
    expect(html).toContain('function readMappedFields(label="Mapped")');
    expect(html).toContain('label+" extraction field keys must be unique."');
  });

  it("teaches mapped fields from native text selections through the authenticated API", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      'id="teachParser" class="btn small teach-parser" type="button">Teach from sample</button>',
    );
    expect(html).toContain(
      '<dialog id="templateTrainerDialog" class="review-dialog trainer-dialog" aria-labelledby="templateTrainerTitle" aria-describedby="templateTrainerDescription">',
    );
    expect(html).toContain('id="trainerFrom" data-trainer-source="from"');
    expect(html).toContain('id="trainerTo" data-trainer-source="to"');
    expect(html).toContain('id="trainerSubject" data-trainer-source="subject"');
    expect(html).toContain(
      '<textarea id="trainerBody" class="trainer-body-input" data-trainer-source="body_text"',
    );
    expect(html).toContain(
      'control.addEventListener("select",()=>captureTrainerSelection(control))',
    );
    expect(html).toContain(
      'control.addEventListener("keyup",()=>captureTrainerSelection(control))',
    );
    expect(html).toContain(
      'control.addEventListener("pointerup",()=>captureTrainerSelection(control))',
    );
    expect(html).toContain(
      "let start=control.selectionStart; let end=control.selectionEnd;",
    );
    expect(html).toContain(
      'api("/api/v1/extraction/infer",{method:"POST",body:JSON.stringify({key,source:selection.source,sample:control.value,selectionStart:selection.start,selectionEnd:selection.end})})',
    );
    expect(html).toContain(
      'headers:{"authorization":"Bearer "+token,"content-type":"application/json"',
    );
    expect(html).toContain(
      "result.field.key!==key||result.value!==selection.value",
    );
  });

  it("starts parser-rule creation from every expanded Audit message", async () => {
    const html = await adminResponse().text();
    const auditReview = html.slice(
      html.indexOf("function buildReviewBody"),
      html.indexOf("function renderAuditDetail"),
    );

    expect(html).toContain(
      '<dialog id="parserRuleDialog" class="review-dialog parser-rule-dialog"',
    );
    expect(html).toContain(
      'id="continueParserRule" class="btn btn-primary primary" type="submit">Create disabled draft</button>',
    );
    expect(auditReview).toContain(
      'node("button","Create rule from this email","btn btn-primary primary small")',
    );
    expect(auditReview).toContain(
      "create.onclick=()=>openParserRuleFromAudit(event,create)",
    );
    expect(auditReview).toContain("if (includeDeliveries)");
    expect(auditReview).toContain("if (audit.rawAvailable===true)");
    expect(html).toContain(
      'api("/api/v1/events/"+encodeURIComponent(eventId)+"/training-sample")',
    );
    expect(html).toContain(
      'byId("parserRuleForm").elements.parserOutcome.value="forward"',
    );
    expect(html).toContain(
      '<input type="radio" name="parserOutcome" value="forward_webhook">',
    );
    expect(html).toContain(
      '<input type="radio" name="parserOutcome" value="create_ticket">',
    );
    expect(html).toContain(
      '<input type="radio" name="parserOutcome" value="create_alert">',
    );
  });

  it("arms, polls, and cancels short-lived parser captures without accepting private storage metadata", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('id="captureBanner"');
    expect(html).toContain('id="captureNextEmail"');
    expect(html).toContain(
      'byId("captureSenderMode").value=sender?"address":"any"',
    );
    expect(html).toContain('api("/api/v1/parser-captures")');
    expect(html).toContain(
      'api("/api/v1/parser-captures",{method:"POST",body:JSON.stringify({sourceEventId:eventKey(event),match,expiresInSeconds:900})})',
    );
    expect(html).toContain(
      'api("/api/v1/parser-captures/"+encodeURIComponent(capture.id))',
    );
    expect(html).toContain(
      'api("/api/v1/parser-captures/"+encodeURIComponent(capture.id)+"/cancel",{method:"POST",body:JSON.stringify({version:capture.version})})',
    );
    expect(html).toContain(
      'const privateKeys=new Set(["objectKey","sampleObjectKey","sha256","sampleSha256","sampleSize","claimEventId"])',
    );
    expect(html).toContain(
      'capture.state==="captured"&&capture.sampleAvailable&&capture.capturedEventId',
    );
    expect(html).toContain(
      "stopCapturePoll(); activeParserCapture=null; parserRuleSample=null;",
    );
  });

  it("loads audited and captured parser samples as selectable read-only text", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function loadTrainerSample(sample)");
    expect(html).toContain('trainerSampleMode="audit"');
    expect(html).toContain(
      "Object.values(trainerSourceControls).forEach((id)=>{ byId(id).readOnly=true; })",
    );
    expect(html).toContain(
      'byId("trainerBody").value=String(sample?.bodyText||"").slice(0,50000)',
    );
    expect(html).toContain('byId("useDryRunSample").classList.add("hidden")');
    expect(html).toContain("if (sample) loadTrainerSample(sample)");
    expect(html).toContain(
      'control.addEventListener("select",()=>captureTrainerSelection(control))',
    );
    expect(html).toContain(
      'setTimeout(()=>openTemplateTrainer(byId("teachParser"),training),0)',
    );
  });

  it("keeps Audit-generated rules disabled until an operator reviews them", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      'id="generatedDraftBanner" class="draft-banner hidden" role="status"',
    );
    expect(html).toContain("The rule starts disabled.");
    expect(html).toContain(
      'const draft={name:("Parse "+cleanSubject).slice(0,120),description:"Drafted from audited email received "+formatDate(event.createdAt)+". Review before enabling.",priority:100,enabled:false',
    );
    expect(html).toContain("openEditor(draft,invoker,{generated:true})");
    expect(html).toContain(
      'byId("generatedDraftBanner").classList.toggle("hidden",!options.generated)',
    );
    expect(html).toContain('byId("ruleEnabled").checked=rule.enabled!==false');
    expect(html).toContain("editorDirty=Boolean(options.generated)");
  });

  it("follows the default mailbox for Audit drafts unless an operator pins one", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      'id="parserMailboxGroup" class="form-field parser-route-field"',
    );
    expect(html).toContain(
      '<select id="parserMailboxId"><option value="">Follow the default Gorelo mailbox</option></select>',
    );
    expect(html).toContain(
      'select.append(makeOption("",defaultMailbox?"Follow default — "+defaultMailbox.name+" · "+defaultMailbox.address:fallbackAddress?"Follow default · "+fallbackAddress:"Follow the default Gorelo mailbox"))',
    );
    expect(html).toContain(
      'goreloMailboxes.filter((mailbox)=>mailbox.routable).forEach((mailbox)=>select.append(makeOption(mailbox.id,"Pin to "+mailbox.name+" · "+mailbox.address+(mailbox.isDefault?" · current default":""))))',
    );
    expect(html).toContain(
      'byId("parserRuleForm").elements.parserOutcome.value="forward"; populateParserMailboxSelect("")',
    );
    expect(html).toContain(
      'const mailboxId=byId("parserMailboxId").value; if (type==="forward") return {type,bypassSpam:false,...(mailboxId?{mailboxId}:{})}',
    );
    expect(html).toContain(
      'const forwards=outcome==="forward"||outcome==="forward_webhook"; byId("parserMailboxGroup").classList.toggle("hidden",!forwards)',
    );
    expect(html).toContain(
      'byId("parserRuleForm").elements.parserOutcome.forEach((input)=>{ input.onchange=renderParserRuleDialog; })',
    );
  });

  it("renders learned templates with safe text nodes and semantic marks", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      "function appendTrainerTemplate(parent,text,captures)",
    );
    expect(html).toContain(
      "parent.append(document.createTextNode(text.slice(cursor,capture.start)))",
    );
    expect(html).toContain(
      'const tokenMark=node("mark","{{"+capture.key+"}}")',
    );
    expect(html).toContain(
      "parent.append(document.createTextNode(text.slice(cursor)))",
    );
    expect(html).toContain(
      'const preview=byId("trainerTemplatePreview"); preview.textContent=""',
    );
    expect(html).toContain(
      'id="trainerTemplatePreview" class="trainer-template">',
    );
    expect(html).toContain(
      'id="trainerCaptureSummary" role="status" aria-live="polite"',
    );
    expect(html).toContain("HTML is never rendered here.");
    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("contenteditable=");
  });

  it("keeps trainer samples transient across close and logout", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function resetTemplateTrainer()");
    expect(html).toContain(
      'function trainerHasWork() { return Boolean(trainerCaptures.length||trainerSelection||byId("trainerKey").value.trim()||((trainerSampleMode==="manual"||trainerSampleMode==="dry_run")&&Object.values(trainerSourceControls).some((id)=>byId(id).value.length))); }',
    );
    expect(html).toContain(
      "trainerRequestVersion+=1; trainerSelection=null; trainerCaptures=[];",
    );
    expect(html).toContain(
      'Object.values(trainerSourceControls).forEach((id)=>{ byId(id).value=""; byId(id).readOnly=false; })',
    );
    expect(html).toContain('byId("trainerKey").value=""');
    expect(html).toContain(
      'byId("templateTrainerDialog").addEventListener("close",()=>{',
    );
    expect(html).toContain(
      "trainerInvoker=null; trainerRestoreFocus=true; resetTemplateTrainer();",
    );
    expect(html).toContain(
      'if (requestVersion!==trainerRequestVersion||!byId("templateTrainerDialog").open) return;',
    );
    expect(html).toContain("closeTemplateTrainer(true,false);");
    expect(html).toContain("if (editorDirty||trainerHasWork())");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
  });

  it("applies learned variables to mapped fields with multiline marker controls", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function applyTrainerVariables()");
    expect(html).toContain(
      "const replacementKeys=new Set(captures.map((capture)=>capture.key))",
    );
    expect(html).toContain(
      "captures.forEach((capture)=>addWebhookFieldRow(capture.field))",
    );
    expect(html).toContain(
      "renumberWebhookFields(); updateClientIdentityOptions(webhookIdentity); populateGoreloIdentityOptions(goreloIdentity); editorDirty=true;",
    );
    expect(html).toContain(
      'const start=node("textarea"); start.id="webhook-start-"+webhookFieldSequence; start.dataset.role="webhook-start-after"; start.className="extraction-marker"; start.rows=2; start.maxLength=256;',
    );
    expect(html).toContain(
      'const end=node("textarea"); end.id="webhook-end-"+webhookFieldSequence; end.dataset.role="webhook-end-before"; end.className="extraction-marker"; end.rows=2; end.maxLength=256;',
    );
    expect(html).toContain(
      "const startAfter=row.querySelector('[data-role=\"webhook-start-after\"]').value;",
    );
    expect(html).toContain(
      "const endBefore=row.querySelector('[data-role=\"webhook-end-before\"]').value;",
    );
    expect(html).toContain(
      'const occurrence=node("input"); occurrence.id="webhook-occurrence-"+webhookFieldSequence; occurrence.dataset.role="webhook-occurrence"; occurrence.type="number"; occurrence.min="1"; occurrence.max="1000";',
    );
    expect(html).toContain(
      'occurrence.value=preset.occurrence===undefined?"":String(preset.occurrence)',
    );
    expect(html).toContain(
      "const occurrence=row.querySelector('[data-role=\"webhook-occurrence\"]').value;",
    );
    expect(html).toContain(
      'if (!startAfter) throw new Error("Extraction field "+index+" needs a start marker before an occurrence can be selected."); result.occurrence=parsed;',
    );
  });

  it("inserts learned variables into the focused Gorelo template safely", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      '<div id="goreloVariableBar" class="gorelo-variable-bar">',
    );
    expect(html).toContain(
      '<span id="goreloVariableTarget" role="status" aria-live="polite">Focus a template field, then choose a token.</span>',
    );
    expect(html).toContain(
      '<div id="goreloVariableChips" class="gorelo-variable-chips" aria-label="Available learned variables"></div>',
    );
    expect(html).toContain(
      'const goreloTemplateLabels = {ticketTitleTemplate:"ticket title",ticketDescriptionTemplate:"ticket description",ticketCreatedByTemplate:"created-by name",alertNameTemplate:"alert name",alertResourceTemplate:"alert resource",alertDescriptionTemplate:"alert description"}',
    );
    expect(html).toContain(
      'const ids=byId("actionType").value==="create_ticket"?["ticketTitleTemplate","ticketDescriptionTemplate","ticketCreatedByTemplate"]:byId("actionType").value==="create_alert"?["alertNameTemplate","alertResourceTemplate","alertDescriptionTemplate"]:[];',
    );
    expect(html).toContain(
      "if (lastGoreloTemplateTarget&&ids.includes(lastGoreloTemplateTarget.id)) return lastGoreloTemplateTarget",
    );
    expect(html).toContain(
      "if (key&&!seen.has(key)&&isSafeTrainerKey(key)) { seen.add(key); keys.push(key); }",
    );
    expect(html).toContain(
      'button.setAttribute("aria-label","Insert {{"+key+"}} into "+(target?goreloTemplateLabels[target.id]:"a Gorelo template"))',
    );
    expect(html).toContain("button.disabled=!target");
    expect(html).toContain(
      "const start=Number.isInteger(target.selectionStart)?target.selectionStart:target.value.length; const end=Number.isInteger(target.selectionEnd)?target.selectionEnd:start;",
    );
    expect(html).toContain(
      'if (target.value.length-(end-start)+value.length>target.maxLength) { showToast("That template is already at its character limit.","error"); return; }',
    );
    expect(html).toContain('target.setRangeText(value,start,end,"end")');
    expect(html).toContain(
      'target.dispatchEvent(new Event("input",{bubbles:true}))',
    );
    expect(html).toContain(
      'byId("goreloActionConfig").addEventListener("focusin",(event)=>{ if (event.target&&Object.hasOwn(goreloTemplateLabels,event.target.id)) { lastGoreloTemplateTarget=event.target; renderGoreloVariableBar(); } })',
    );
    expect(html).toContain(
      'byId("actionType").onchange=()=>{ lastGoreloTemplateTarget=null; updateActionFields(); editorDirty=true; }',
    );
    expect(html).toContain(
      "updateClientLinkageFields(); updateGoreloClientLinkage(); renderGoreloVariableBar();",
    );
  });

  it("rejects reserved and credential-shaped keys in trainer and manual mappings", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function isSafeTrainerKey(value)");
    expect(html).toContain(
      'const exact=new Set(["__proto__","constructor","prototype","authorization","proxy_authorization","api_key","apikey","access_token","refresh_token","token","password","passwd","secret","client_secret","private_key","cookie","set_cookie","credential","credentials"])',
    );
    expect(html).toContain(
      'const forbidden=new Set(["authorization","apikey","password","passwd","secret","token","cookie","credential","credentials"])',
    );
    expect(html).toContain(
      "!trainerSelection||!isSafeTrainerKey(key)||duplicate||trainerCaptures.length>=50",
    );
    expect(html).toContain(
      'if (!isSafeTrainerKey(key)) throw new Error("Use a safe variable name without credential words such as token, password, or secret.")',
    );
    expect(html).toContain(
      'if (!isSafeTrainerKey(key)) throw new Error("Extraction field "+index+" uses a reserved or credential-shaped key.")',
    );
  });

  it("requires an enabled signed destination but preserves advanced JSON editing", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function assertWebhookActionReady(action)");
    expect(html).toContain(
      "!webhookCapability?.configured||!webhookCapability.signingConfigured",
    );
    expect(html).toContain(
      "webhooks.find((webhook)=>webhook.id===action.webhookDestinationId)",
    );
    expect(html).toContain("JSON.stringify(collectBuilder(false),null,2)");
    expect(html).toContain("assertWebhookActionReady(input&&input.action)");
    expect(html).toContain(
      'if (mapped&&!byId("webhookFields").children.length)',
    );
    expect(html).toContain("void ensureWebhookActionDestinations()");
    expect(html).not.toContain("sendWebhookTest");
  });

  it("builds API-only Gorelo tickets and alerts from extracted fields", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      '<option value="create_ticket">Create Gorelo ticket via API</option>',
    );
    expect(html).toContain(
      '<option value="create_alert">Create Gorelo alert via API</option>',
    );
    expect(html).toContain('id="mappedActionConfig"');
    expect(html).toContain('id="goreloClientMode"');
    expect(html).toContain('id="goreloClientId"');
    expect(html).toContain('id="goreloClientIdentityField"');
    expect(html).toContain('id="goreloClientAliasScope"');
    expect(html).toContain('id="ticketTitleTemplate"');
    expect(html).toContain('id="ticketStatusId"');
    expect(html).toContain('id="ticketGroupId"');
    expect(html).toContain('id="ticketTypeId"');
    expect(html).toContain('id="ticketAgentAssetIds"');
    expect(html).toContain('id="alertNameTemplate"');
    expect(html).toContain('id="alertResourceTemplate"');
    expect(html).toContain('id="alertSeverity"');
    expect(html).toContain(
      "API-only action: the original message is not forwarded.",
    );
    expect(html).toContain(
      'byId("actionMailboxGroup").classList.toggle("hidden",!forwards)',
    );
    expect(html).toContain("function collectGoreloAction(");
    expect(html).toContain("titleTemplate=readTemplate(");
    expect(html).toContain("action.sendTicketCreatedEmail=");
    expect(html).toContain("action.isUnread=");
    expect(html).toContain("action.nameTemplate=readTemplate(");
    expect(html).toContain("action.resourceTemplate=readTemplate(");
    expect(html).toContain("action.severity=severity");
    expect(html).toContain("assertGoreloActionReady(input&&input.action)");
    expect(html).not.toContain('id="ticketCustomAssetIds"');
    expect(html).not.toContain('id="ticketUptimeIds"');
  });

  it("loads current Gorelo catalogs and scopes client-specific selectors", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      'api("/api/v1/integrations/gorelo/catalogs/"+encodeURIComponent(kind)',
    );
    expect(html).toContain(
      'const goreloGlobalCatalogKinds = ["groups","ticket-statuses","ticket-tags","ticket-types","users","agent-assets"]',
    );
    expect(html).toContain(
      'loadGoreloActionCatalog("locations",clientId,force)',
    );
    expect(html).toContain(
      'loadGoreloActionCatalog("contacts",clientId,force)',
    );
    expect(html).toContain("function populateGoreloClientSelect()");
    expect(html).toContain("goreloClients.filter((client)=>!client.stale)");
    expect(html).toContain("function updateGoreloClientLinkage()");
    expect(html).not.toContain(
      "Client-specific contacts, locations, and assets require a fixed client",
    );
    expect(html).toContain(
      'const clientSpecific=fixed&&byId("actionType").value==="create_ticket"',
    );
    expect(html).toContain('id="refreshGoreloCatalogs"');
  });

  it("renders a non-mutating structured Gorelo dry-run preview", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      "function renderGoreloDryRunPreview(result,container)",
    );
    expect(html).toContain("const preview=result.goreloPreview");
    expect(html).toContain("Structured Gorelo preview");
    expect(html).toContain(
      "no Gorelo API request was sent, no ticket or alert was created",
    );
    expect(html).toContain("Prepared credential-free API request");
    expect(html).toContain('goreloAction?"Gorelo API · no email forward"');
  });

  it("uses compact, explicit dry-run result states without stale submissions", async () => {
    const html = await adminResponse().text();
    const dryRunScript = html.slice(
      html.indexOf("function setTestResultState"),
      html.indexOf("function parseSetupResponse"),
    );

    expect(html).toContain(
      'id="testResultStatus" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"',
    );
    expect(html).toContain(
      'id="testResult" class="test-result is-empty" aria-busy="false"',
    );
    expect(html).toContain('aria-describedby="testError"');
    expect(html).toContain(
      ".test-result { position:sticky; top:16px; min-height:0; align-self:start; padding:16px;",
    );
    expect(html).toContain(
      ".result-empty { min-height:0; display:grid; grid-template-columns:42px minmax(0,1fr);",
    );
    expect(html).not.toContain(".result-empty { min-height:330px;");
    expect(dryRunScript).toContain('result.className="test-result "+state');
    expect(dryRunScript).toContain(
      'result.setAttribute("aria-busy",busy?"true":"false")',
    );
    expect(dryRunScript).toContain(
      'renderTestStatus("is-evaluating","refresh","Evaluating policy"',
    );
    expect(dryRunScript).toContain(
      'renderTestStatus("has-error","warning","Evaluation failed"',
    );
    expect(dryRunScript).toContain(
      'const button=byId("runTest"); const form=byId("testForm"); if (button.disabled) return;',
    );
    expect(dryRunScript).toContain(
      "if (!form.reportValidity()) { resetTestResult(); return; }",
    );
    expect(dryRunScript).toContain('form.querySelectorAll("input,textarea")');
    expect(dryRunScript).toContain(
      "controls.forEach((control)=>{ control.readOnly=true; })",
    );
    expect(dryRunScript).toContain("control.readOnly=readOnlyStates[index]");
    expect(dryRunScript).toContain("const requestVersion=++testRequestVersion");
    expect(dryRunScript).toContain(
      "if (requestVersion!==testRequestVersion||!token) return;",
    );
    expect(dryRunScript).toContain(
      "form.contains(document.activeElement)?document.activeElement:null",
    );
    expect(dryRunScript).toContain(
      "activeElement===document.body||activeElement===document.documentElement",
    );
    expect(dryRunScript).toContain(
      'byId("testTabButton").getAttribute("aria-selected")==="true"',
    );
    expect(dryRunScript).toContain("focusedControl.focus()");
    expect(dryRunScript).toContain(
      'const container=setTestResultState("has-result")',
    );
    expect(dryRunScript).toContain(
      'catch(error) { if (requestVersion!==testRequestVersion||!token) return; renderTestFailure(); showError("testError",error);',
    );
    expect(html).toContain(
      'byId("testForm").oninput=()=>{ const result=byId("testResult"); if (result.classList.contains("has-result")||result.classList.contains("has-error")) { clearError("testError"); resetTestResult(); } };',
    );
    expect(html).toContain(
      'testRequestVersion+=1; resetTestResult(); clearError("testError");',
    );
  });

  it("validates and renders outbound delivery evidence in expanded audit details", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function validateAuditDeliveries(value)");
    expect(html).toContain("if (value===undefined) return []");
    expect(html).toContain(
      "const detailedEvent={...data.event,deliveries:validateAuditDeliveries(data.deliveries)}",
    );
    expect(html).toContain('reviewSection("Outbound deliveries")');
    expect(html).toContain('node("h6","Extracted variables")');
    expect(html).toContain('node("h6","Resolved Gorelo client")');
    expect(html).toContain('node("h6","Attempt history")');
    expect(html).toContain('node("h6","Prepared Gorelo request")');
    expect(html).toContain('eventDetail("API region"');
    expect(html).toContain('eventDetail("Gorelo ticket ID"');
    expect(html).toContain("Manual review required: Gorelo may have accepted");
    expect(html).toContain("delivery.safeError");
    expect(html).toContain("attempt.safeError");
    expect(html).toContain('"HTTP "+attempt.httpStatus');
    expect(html).toContain("cached&&Array.isArray(cached.deliveries)");

    const renderer = html.slice(
      html.indexOf("function buildOutboundDeliveries"),
      html.indexOf("function buildReviewBody"),
    );
    expect(renderer).not.toContain("destinationId");
    expect(renderer).not.toContain("payloadDigest");
    expect(renderer).toContain("providerId");
    expect(renderer).not.toContain(".url");
    expect(renderer).not.toContain("secret");
  });

  it("offers authenticated archived-original downloads in expanded audits", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("if (includeDeliveries) { const actions=");
    expect(html).toContain("if (audit.rawAvailable===true)");
    expect(html).toContain("Download archived original (.eml)");
    expect(html).toContain("function downloadAuditRaw(event,button)");
    expect(html).toContain(
      'fetch("/api/v1/events/"+encodeURIComponent(id)+"/raw",{headers:{authorization:"Bearer "+token}})',
    );
    expect(html).toContain('link.download=base+".eml"');
  });

  it("makes ambiguous quarantine releases explicit and non-actionable", async () => {
    const html = await adminResponse().text();

    expect(html).toContain(
      '<option value="releasing">Release in progress / uncertain</option>',
    );
    expect(html).toContain('"Release outcome uncertain"');
    expect(html).toContain(
      'eventDetail("Release message ID",q.releaseMessageId)',
    );
    expect(html).toContain(
      "Manual review required. Dispatch may have been accepted, so this release cannot be retried automatically.",
    );
    expect(html).toContain('availability.uncertain?"Manual review required"');
    expect(html).toContain(
      'const actionable=state==="pending"||state==="release_failed"',
    );
  });

  it("searches and pages the full retained quarantine and audit ledgers", async () => {
    const html = await adminResponse().text();

    expect(html).toContain('id="loadMoreQuarantine"');
    expect(html).toContain('id="loadMoreEvents"');
    expect(html).toContain("const RETAINED_MESSAGE_PAGE_SIZE = 50");
    expect(html).toContain('parameters.set("cursor",requestedCursor)');
    expect(html).toContain('parameters.set("q",query)');
    expect(html).toContain("quarantineCursor=pageCursor(data.nextCursor)");
    expect(html).toContain("eventsCursor=pageCursor(data.nextCursor)");
    expect(html).toContain(
      'byId("quarantineSearch").oninput=scheduleQuarantineSearch',
    );
    expect(html).toContain('byId("eventSearch").oninput=scheduleEventSearch');
    expect(html).toContain(
      'byId("loadMoreEvents").onclick=()=>runBusy(byId("loadMoreEvents"),"Loading…",()=>loadEvents(true))',
    );
  });

  it("labels API-only Gorelo outcomes without claiming an email forward", async () => {
    const html = await adminResponse().text();

    expect(html).toContain("function structuredAuditAction(event)");
    expect(html).toContain('return "create_ticket"');
    expect(html).toContain('return "create_alert"');
    expect(html).toContain("function auditPresentation(event)");
    expect(html).toContain('succeeded:noun+" created"');
    expect(html).toContain('uncertain:noun+" outcome uncertain"');
    expect(html).toContain(
      'destinationLabel:"Gorelo API · original email not forwarded"',
    );
    expect(html).toContain(
      'eventDetail("Decision",presentation.decisionLabel)',
    );
    expect(html).toContain(
      'eventDetail("Action status",presentation.statusLabel)',
    );
    const eventRenderer = html.slice(
      html.indexOf("function renderEvents"),
      html.indexOf("function loadEvents"),
    );
    expect(eventRenderer).toContain("presentation.statusLabel");
    expect(eventRenderer).toContain("presentation.actionLabel");
    expect(eventRenderer).not.toContain('node("span",event.status');
    expect(eventRenderer).not.toContain('node("strong",event.decision');
  });

  it("contains syntactically valid dashboard JavaScript", async () => {
    const html = await adminResponse().text();
    const script = html.match(/<script[^>]*>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  });
});
