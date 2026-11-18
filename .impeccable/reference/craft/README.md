# Craft references

Apps whose craft the owner wants graeae to learn from, gathered for the second critique and polish pass (after ticket 28). This file covers what each image shows, what graeae takes from it, and what it refuses. What the write-ups themselves say, with citations, is in [write-ups.md](write-ups.md). How to use the two in a pass is in [lens.md](lens.md).

**What these are for.** They are a bar for precision and a source of principles, not looks to copy. graeae stays "the grey ones" (`DESIGN.md`): greys only, the eye as the one colour, tone instead of lines, Geist. Where a reference breaks one of DESIGN.md's rules, the rule wins. Each entry below names the rule. Never copy a reference's layout, icons, wording or brand marks wholesale.

The supplied screenshots are full size, taken from sample accounts, with account details and a Graphite CLI token masked. Publisher images are as their sources served them; links are in [write-ups.md](write-ups.md). The Linear before/after image is at half its published size (1952×1360).

## Linear

The closest reference: the same grammar graeae already has.

- `images/linear/linear-issues.png`: the app at 1920 wide. A dark ground, with the content panel inset one tone lighter, rounded and with no border. The sidebar sits on the ground, with muted 13px labels in rows, and the current row on a raised fill. Section labels ("Workspace", "Your teams") are dimmer than the rows. The list rows are 44px apart, with the title in medium weight and metadata in muted grey on the right. Most of the panel is empty and nothing fills it.
- `images/linear/linear-sidebar-before-after.png`: the sidebar before and after a refresh, annotated "smaller refined icons", "muted text for inactive items", "additional vertical padding". Inactive items lose contrast so the current one leads.
- `images/linear/linear-preferences.png`: settings. A narrow centred column inside the inset panel. Each group has a heading above a raised panel. Each setting is a row with the name in medium weight, a muted description under it, and the control at the right edge. The rows are split by hairlines.
- `images/linear/linear-profile.png`: onboarding. One small left-aligned stack: heading, muted subline, labelled fields, a ghost "Skip" beside a filled "Continue".

**Take:** the inset panel on the ground; inactive rows quieter than the current one; settings as label-and-description rows with the control on the right; a lot of empty space left as it is.
**Refuse:** the hairlines between setting rows (the Tone Not Lines Rule: separate rows with space or a raised panel); the indigo toggle (the One Eye Rule: the eye is not a control colour); "First day of the week" (the Plain Words Rule: no day of the week anywhere).

## Vercel

- `images/vercel/vercel-dashboard-navigation.png`: the redesigned navigation. A sidebar of 40px rows with icons and a "Find…" field with an `F` key hint. The current item is on a raised fill. Chevrons mark items that open further.
- `images/vercel/vercel-projects.png`: an empty dashboard. Each empty card says what will appear there ("Your usage will appear here", "Preview deployments that you have … created will appear here") with one quiet icon, and offers at most one action.

**Take:** an empty state that says what will appear and offers the one next step; key hints printed beside the controls they trigger (graeae's "S" and "[" do this already).
**Refuse:** the 1px borders on cards and fields (Tone Not Lines); blue link text (One Eye); the dense, chevron-heavy navigation, since graeae's owner page has four sections.

## Graphite

- `images/graphite/graphite-inbox.png`: a pull-request inbox. Named sections, each with a count, listed in a side column and repeated as collapsible bars. A blue "Next step" banner and an info strip sit above everything.
- `images/graphite/graphite-setup.png`: five numbered setup steps. The current one is expanded and outlined, the done one struck through, and the rest closed.

**Take:** a count beside every section heading (graeae's "Here 4"); one step expanded at a time.
**Refuse:** the banners on arrival (PRODUCT.md: "No banners on arrival"; a gap is shown only when it matters); the outlined cards (Tone Not Lines); onboarding steps (Principle 3: "no onboarding tours").

## Cursor

- `images/cursor/cursor-composer.png`: a new chat. A near-empty panel with one input card at the top and a model choice inside it. The sidebar says "No agents yet" with a "+".

**Take:** an empty page whose one job is plain at a glance.
**Refuse:** the upsell strip on the input ("requires a Premium Account"), and the "Upgrade" button in the sidebar. Nothing in graeae sells.

## Resend

- `images/resend/resend-emails.jpg`: the dashboard after the rebrand. Pure black, a wide centred table, search and three filters in one row, and a status pill in colour on every row.
- `images/resend/resend-logs-list.png`: the logs list. Filters as one row of fields above a table whose header row sits on a raised band.
- `images/resend/resend-log-detail.png`: a log's detail. A large heading, then a grid of label-over-value pairs (uppercase muted labels), then a red error panel with a "Help me fix" action.

**Take:** label-over-value pairs for a record's facts (the owner page's member panel, the usage figures); an error that says what happened in one sentence with the way out beside it; one row of filters only when a list is long enough to need them.
**Refuse:** a status pill in colour on every row (the One Meaning Rule: colour is not a status code; graeae marks state with words and grey, and keeps red and amber for stop and warning); uppercase labels (DESIGN.md's labels are sentence case); the hairlines under rows (Tone Not Lines).

## Raycast

- `images/raycast/raycast-action-panel.webp`: the action panel. A floating list of the actions on the current item, titled with the item. Each row has an icon, a label and its key combination drawn as small keycaps at the right. Groups are split by space and a divider, and a search field sits at the foot.

**Take:** every action named where it lives, with its key beside it, so the keyboard is learnt by looking (graeae's tooltips carry keys; check that every keyed action shows its key somewhere). The first row is the default action, on Enter.
**Refuse:** the translucent, blurred surface over a coloured wallpaper (graeae is flat, layered by tone); a command palette as a new feature, since this pass changes no behaviour.

## Railway

- `images/railway/railway-project-canvas.png`: a project as a canvas of service cards joined by dashed lines, each card with its state in a line of coloured text ("Sleeping since 8 hours ago"), and an activity feed on the right.

**Take:** state written as a short plain sentence with a time ("Sleeping since 8 hours ago"), not only an icon.
**Refuse:** the purple accents and the dotted canvas (One Eye, no decoration without a job); state in colour (One Meaning).

## Things

- `images/things/things-mac-dark-mode.jpg`: Things 3 in dark mode (2018). Mid-dark greys, not black. Rows carry a quiet second line naming their project. Section headings are coloured and underlined, and a selected row sits on a blue band.

**Take:** the second line in muted grey that places a row ("Vacation in Rome" under a to-do), as graeae's People rows place a member ("First room"); a dark mode made of its own greys rather than the light theme inverted.
**Refuse:** colour on headings and icons (One Eye, One Meaning); the blue selection band (DESIGN.md: selection is a foreground tint).

## Flighty

- `images/flighty/flighty-delay.png`: a flight's card. The state is big and early ("30m Delay Predicted" with the cause under it), the times are large, coloured and tabular, the old time is struck through beside the new one, and "Departs in 1h 15m" is counted down in plain words.

**Take:** the one thing that matters said first and plainly, with its cause in the line under it; figures large and tabular where a figure is the point (graeae's usage figures); a relative time in plain words beside the hard one.
**Refuse:** green, red, yellow and magenta as status, and the gradient "AI" sparkle (One Eye, One Meaning). graeae's notes stay grey and go only to the member they concern (Principle 4).

## Readwise Reader

- `images/readwise-reader/readwise-reader-inbox.webp`: a library list. A thumbnail, a title in medium weight, a one-line excerpt in muted grey, then a metadata line of small grey parts joined by dots. Row actions show on hover, and a thin progress line runs under a row that has been started.

**Take:** row actions that appear on hover and leave the row calm at rest (graeae's stage tiles do this); a dot-joined metadata line in muted grey ("Duda · reconnecting").
**Refuse:** the yellow highlights and the coloured progress line (One Eye); tag chips (no squarish decoration).
