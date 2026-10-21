// Only categories and fixed recovery text cross the CLI error boundary. Unknown
// errors/provider bodies/paths/configuration values are never interpolated.
const catalog={
 configuration:['Configuration missing or malformed.','Check the documented public JSON/private env formats and original paths locally.'],
 identity:['Customer/project or pairing identity does not match.','Compare the intended Platform client/project with the original pairing and journal; never regenerate to bypass a mismatch.'],
 release:['Checkout/release fingerprint mismatch.','Use the reviewed original release checkout; do not repin or replace an existing journal.'],
 mode:['Installation mode is invalid or conflicts with the saved operation.','Select fresh only for an empty eligible project; existing requires its exact migration and pairing provenance. Never reset a Shop.'],
 cli_unavailable:['Compatible native CLI is unavailable.','Check node --version and the reviewed CLI tooling/version; use the native executable and resume the same journal.'],
 cli_authorization:['Customer CLI authorization/project visibility failed.','Sign in to the authorized customer account with --login; verify access to the intended project, then resume.'],
 history:['Migration history/provenance needs review.','Compare the original ledger and release source. Do not adopt, reset or replay an uncertain migration manually.'],
 provider:['Provider operation failed or could not be observed.','Check the named project and retained operation locally. Do not print provider output or retry uncertain writes blindly.'],
 unknown_write:['Outcome unknown for a provider write.','Retain original files/request/journal. Review authoritative provider completion before --confirm-provider-complete; elapsed time is not evidence.'],
 interrupted:['Interrupted operation needs reconciliation.','Confirm the earlier process stopped, inspect original step/provider state, then resume the same journal.'],
 lock:['Local journal is locked by another or interrupted process.','Do not remove its lock while a process may run. After confirming it stopped, inspect the journal/provider state before resuming.'],
 journal:['Local journal cannot be read or safely saved.','Check the original path, permissions and valid JSON locally. Preserve it and any .tmp/.lock files; never delete or replace it as recovery.'],
 prerequisites:['Owner/onboarding or original Support prerequisites are incomplete.','Complete the current Platform/Shop step and resume the same journal; Support is optional for core acceptance.'],
 cancelled:['Installation was not authorized.','Resume the same retained operation when ready; no installation writes were authorized.'],
 internal:['Setup stopped at an unclassified local boundary.','Keep original inputs and journal if present. Review the fixed phase/check summary; do not share raw private files.'],
};
export class InstallerError extends Error{
 constructor(category,message){super(message||catalog[category]?.[0]||catalog.internal[0]);this.category=category in catalog?category:'internal'}
}
export function diagnosticFor(error,context={}){
 let category=error instanceof InstallerError?error.category:null;
 if(!category){
  if(error?.code==='EEXIST')category='lock';
  else if(['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error?.code))category=context.phase==='journal'?'journal':'configuration';
  else if(error instanceof SyntaxError)category=context.phase==='journal'?'journal':'configuration';
  // Existing helpers emit only their fixed literals. Match categories but never
  // forward their raw message (including a malicious provider error).
  else if(/^(Needs intervention|Outcome unknown)/.test(error?.message||''))category='unknown_write';
  else if(/^(Migration source conflict|Incomplete or unexpected migration history|Existing schema without history|Fresh initialization is not proven|Fresh Shop provenance)/.test(error?.message||''))category='history';
  else if(/^(Setup target, release|Observed Shop|Exact customer|Pairing file target|Existing Shop binding|Support target differs|Support enrollment identity)/.test(error?.message||''))category='identity';
  else if(/^(Checkout differs|Customer checkout differs)/.test(error?.message||''))category='release';
  else if(/^(Cannot change the saved installation mode|Explicit fresh\/existing)/.test(error?.message||''))category='mode';
  else if(/^(Customer CLI account cannot access|Current Supabase CLI account cannot access)/.test(error?.message||''))category='cli_authorization';
  else if(/^(Compatible native|A supported native|CLI lacks|Installed Supabase CLI lacks)/.test(error?.message||''))category='cli_unavailable';
  else if(['ConfigurationError','SetupError'].includes(error?.constructor?.name))category='configuration';
  else category='internal';
 }
 const [message,next_action]=catalog[category];
 return {contract:'retrasell-byo-diagnostic-v1',phase:context.phase||'arguments',category,message,
  completed_checks:(context.checks||[]).filter(x=>['journal','pairing_identity','release','public_configuration','cli','preflight','installation','owner_onboarding'].includes(x)),
  provider_writes:context.writes||'none',journal_exists:context.journalExists===true,next_action};
}
export function attachDiagnostic(error,context){const diagnostic=diagnosticFor(error,context),safe=new InstallerError(diagnostic.category);safe.diagnostic=diagnostic;return safe}
