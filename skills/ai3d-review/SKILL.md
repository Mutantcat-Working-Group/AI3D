---
name: "ai3d-review"
description: "Review a 3D model draft in a browser: mark surfaces, read the marks, publish the next version."
---

# AI3D model review

## 1. Deciding to review

When someone wants a 3D model built or changed, wants to point out what is wrong
with one, wants a draft checked, or wants to keep iterating, use AI3D as the
browser review entry. Do not wait for them to name the product. Skip it for pure
conceptual questions, for a plain request for a file, and whenever they say they
do not want a web page. With no draft yet, first build an editable source and hand
AI3D what it reads: a STEP goes in as it is, no mesh export first. Done
means a model that actually loads, not a URL.

## 2. Checking the tool and the project

Find and call `ai3d`'s `inspect` action to check the workspace, agent,
session and generation; on Telegram the return target and account as well. When
the tool is missing, the sandbox forbids it, or the context is incomplete, say
what is actually absent — never substitute a guessed command, localhost, or an
old topic's URL. Choose a separate `projects/<name>` for new modelling work, or
reuse the engineering directory already being modelled in; never treat the
AI3D codebase or an old trial directory as the model project. Set
`resume: true` only when the user is explicitly continuing that project. With
several candidate projects, clarify the project alone. Done means exactly one
project and one originating session.

## 3. Measuring before publishing

Run `precheck` on a GLB or STL before every `open`; it only reads and starts no
instance. Skip it for a STEP: `open` measures one as it imports it. The limits are 600000 triangles and 80 MB, and they are the only ones
— a dense model marks exactly as precisely as a sparse one.

`verdict: "ok"` publishes as is. On `reject`, simplify first and say in the
conversation that you simplified, at what ratio, and from how many faces to how
many; `simplify.requiredRatio` is measured from that file and lands inside the
cap. Prefer re-exporting from STEP or a modelling script with a looser chord
height — geometry stays exact. Use headless Blender decimation only when there
is a mesh and no source. Done means the user knows whether they are reviewing
original or simplified geometry.

## 4. Publishing a draft and delivering the URL

Call `ai3d` with `action: "open"`, giving the workspace-relative `project`,
the actual `file`, the model `name`, a recognisable `version` and `units`; use
`label` for a short tab caption. Source, recipient and topic come from the host
context and are never added as tool parameters. To open a LAN entry for another
machine, use a `confirmedClientAddress` the user has verified; reuse a device
already verified in the package rather than treating the first visitor or a
User-Agent as confirmation. When device details are missing, ask only for the
IPv4 — never for a token or a pairing code.

AI3D draws STEP and STL +Z up with −Y to the front, and GLB +Y up; rotate a
model built otherwise before publishing, since nothing is guessed. Marks come
back in the file's own coordinates and units.

Publishing switches to the new version immediately; nothing queues, and the user
does not have to end the previous round first. Deliver only the URL the tool
actually returned, along with the model version really being displayed.
`client_address_needed` means the first admission is not ready — do not say
marking can begin. Browser trust is stored per project and expires after 30
unused days. A health check on the serving machine is not the same as the page
being open on the user's. When reopening or upgrading an instance, compare the
`viewerReceipts` before and after by version, SHA and `loadedAt`: only a new
receipt from after this reopen, against the current model, is evidence that the
viewer loaded it. A retained receipt is not re-verification. Done means the
right project entry was delivered and its end-device state described accurately.

## 5. Controlling which version is shown

Every published version stays, each with its own draft and marks, listed as tabs
at the top of the page, and the user can return to any of them and mark there.
Switching therefore loses nothing and needs no permission.

Use `status` to read `versions`: each carries an `id`, a `version`, its mark
count, unsubmitted count, submitted batches, and whether a window is open. Use
`activate` to change what is displayed, passing `versionId` or the `version`
string. To add a version without disturbing what the user is looking at right
now, pass `activate: false` to `open`.

Let a new version become the displayed one — that is the version they are about
to mark. `activate: false` is for the single case where they are drawing at this
moment and you only want the new version on the tab strip; say so, and switch
once they stop. Leaving it unswitched strands the display pointer on an old
version, and the page's account of which version is being viewed goes wrong with
it. `finish` (ending a round on one version) and `unlock` (clearing a stale
presence record) are not part of iteration: the next version is the end of the
last one, the page gives the user no button to end a round, so never tell them
to press one. Use `finish` only when they explicitly ask to close a version out.

When a long strip starts getting in the way of the model, and only when the user
asks for it, `retain` with `keep: 3` — or any count — shows just that many most
recent versions. It hides and never deletes: the draft, the marks, the submitted
batches and the file of a hidden version all stay, and `retain` with a larger
count, or `keep: 0`, brings every one of them back unchanged. It is a standing
rule rather than a one-off tidy-up, so each version published afterwards pushes
the oldest out of view without being asked again. Three things outrank it and
stay visible anyway: the version on screen, one somebody is marking at that
moment, and one still holding unsubmitted marks. The reply lists those under
`keptVisible` with the reason, so report what is actually showing rather than
the number that was requested. The page applies this on its next poll, so never
tell the user to reload or close it.

## 6. Reading marks and answering the intent

On a submission notice, call `ai3d`'s `read` with the `project` and
`submissionId` from the notice to read the full 3D annotations, model version
and camera; the tool writes the read receipt for that batch at the same time.
Never claim to have understood a change from a position summary alone. Match
pins and coloured regions to the change described in the conversation, and ask
only when the method, a dimension or the meaning is missing. Use `echo` to show
your understanding, giving the same batch's `summary` and surface regions in
`annotations` that you have actually read and verified — never invented mesh
coordinates.

Two kinds of batch are handled differently. A batch with `sealed: true` was not
handed over deliberately; it is unfinished work closed out on the user's behalf
when a version's round ended, so ask what they meant rather than executing it as
a change request. For a batch against an older version — a `versionId` that is
not the active one — check whether that place has already been changed in the
current version before deciding whether it is a correction or a stale opinion;
the submission carries the model snapshot of the time, which is enough to
compare. Done means the batch, the version and the intent all agree.

## 7. Changing, republishing and delivering files

Change the editable source with the original modelling tool, save a new version,
`precheck` it unless it is a STEP, then `open` it in the same project. Keep old
versions and the record of changes: they must never be deleted or overwritten,
and they stay on the tab strip on their own unless the user asks for a shorter
one, which `retain` gives them without losing anything. Use `status` to check
the actually active version and each version's mark state, then say in the
originating conversation what changed and which batch it answers. The review
page has no download entry and the user never needs to export the marks
themselves; files are delivered in the conversation, when they ask or when the
work is final. What is marked is always a mesh — a STEP is tessellated on
import — so never describe it as editable CAD. Export 3MF and print files from
the modelling tool and check units and scale. Done means the user reviewed the right new version and
received the agreed files.

## 8. Continuing and handling failures

While the host is unreachable, keep the submission and wait for the original
source to retry, distinguishing saved, accepted by the host and read by the
agent. Reaching the outbound queue counts as handed over; confirmed delivery is
a separate thing, and an unconfirmed send is not a reason to say the user has
not submitted. On `RESUME_REQUIRED`, confirm the user is continuing that project
before using `open` with `resume: true`; old batches never change recipient. When
another topic is marking, a `/new` generation does not match, a port conflicts,
or an identity check fails, keep the data and report the tool's state — do not
kill the occupying process, move the URL, or reissue a pile of authorizations.
Use `stop` when maintenance needs the instance down; `REVIEW_BUSY` means someone
is marking right now, so retry later rather than asking them to end their round.
Done means data and session ownership are unchanged, or a legitimate handover is
explicitly complete.

## 9. A review that closed itself

A review nobody has used for a day closes itself and its URL stops answering.
This is not a fault and needs no diagnosis: every version, every draft and every
saved mark stays on disk. When the user reports a dead or closed page, or the
page tells them it was closed for being idle, `open` the same project again and
give them the new entry — `status` beforehand will simply say it is not running.
`status` also reports `idle` as `forMs` against `limitMs`, and asking never
resets it, so it can be quoted as it stands. Publishing, reading, echoing and
opening all count as use; polling status does not.

`open` may return `runtimesNeedingReopen`: other projects still served by a
build too old to close itself. Say which ones, so the user can decide to reopen
them. Never stop somebody else's project on the strength of it.
