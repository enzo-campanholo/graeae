# Craft references: what the write-ups say

Read on 2026-11-18, at the primary URLs the owner supplied. The images are covered in [README.md](README.md), and [lens.md](lens.md) turns both into questions for graeae's surfaces.

**Reached:** all 27 web sources.
**Unreached:** none. No secondary sources were used.

**How quotes were checked.** Quoted phrases were checked against each page's raw text (downloaded with curl). The checks cover every Linear, Resend and Flighty source, Things' dark-mode post, and spot checks on every other source. Text outside quotation marks is paraphrase. Where a source is silent on something a reader might expect it to cover, this file says so, so its silence is not read as a claim.

---

## Linear

### A calmer interface for a product in motion
<https://linear.app/now/behind-the-latest-design-refresh>. Linear Now, "From the team". Charlie Aufmann and Maxime Heckel, 12 March 2026.

**Why.** Software "contorts out of shape one useful feature at a time … a new control here, another state there", until it feels "crowded, inconsistent, and hard to use". The named example is header bars: actions like sharing a page, copying a link and opening a PR "no longer appeared in predictable places". The goal is that the product "should feel familiar and fluid", keeping its "rich density of information without letting the interface feel overwhelming". The post names the header problem but does not describe its fix.

**Principle: "Don't compete for attention you haven't earned"** (section heading). In a dense product, "not every element of the interface should carry equal visual weight". Parts central to the task stay in focus; parts that "support orientation and navigation should recede".
- **Sidebar:** it used to be bright enough to stay "visually prominent even after a user had reached their destination". It is now "a few notches dimmer, allowing the main content area—where users work—to take precedence."
- **Desktop tabs:** "more compact rather than spanning the full width of the screen, with rounded corners and smaller icon and text sizing", including "smaller icon-only tabs".
- **Icons:** in some views their presence "had grown excessive". The refresh "reduces icon usage, scales their sizes down, and removes unnecessary visual treatments like colored team icon backgrounds."

**Principle: "Structure should be felt not seen"** (section heading). Borders and separators "had quietly proliferated across the platform, sometimes appearing without clear reason." The fix: fewer separators, "rounding out their edges and softening the contrast", so users get "structure on the page without cluttering their view". Separators are reduced, not removed.

**Colour.**
- Custom themes remain: users pick base UI and accent colours and adjust contrast.
- The default light and dark modes changed. The old palette was "a cool, blue-ish hue"; the new aim is "a warmer gray that still feels crisp, but less saturated." "Go too warm, though, and the interface risks looking muddy", which took "a fair bit of iteration".
- **Method:** they built a colour tool in the dev toolbar with Claude Code. It does everything the user-facing theme builder does, plus "tweaking the hue, chroma, and lightness of individual design tokens". Anyone at Linear could share a "recipe". The final token values were exported as JSON and imported into Figma with a plugin by Yann-Edern Gillet, so the live UI and the design system stayed aligned.

**Process.**
- A dev-toolbar feature flag let them compare old and new UI in "just one click", to tell whether the refresh had broken something or it had always behaved that way. It also let them ship incremental changes rather than one big release.
- A "team of two", two months into the codebase, used coding agents to find where components were defined and used, and to build internal tools "in a couple of hours".

**Closing.** "If most people don't immediately notice what changed, that's probably a good sign"; "most of what makes software feel good is what you aren't likely to see."

**Not in the post:** fonts, type sizes, spacing values, motion, contrast ratios or colour values.

### How we redesigned the Linear UI (part Ⅱ)
<https://linear.app/now/how-we-redesigned-the-linear-ui>. Linear Now. Karri Saarinen, with Yann-Edern Gillet, Andreas Eldh and Romain Cascino, 28 March 2024.

**Scope.** They "adjusted the sidebar, tabs, headers, and panels to reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements."
- **Navigation was deliberately deferred.** Changing it would need significant engineering work and change user behaviour, "an unnecessary risk" that would widen the scope.
- "A redesign should not completely disassemble the product to its atomic parts."
- The focus was the "inverted L-shape … the global chrome of the application that controls the content in the main view."

**Concept method.**
- Each day Karri designed a complete set of screens and flows on one theme (Inbox one day, roadmap and projects the next), varying the sidebar, visual style and colour, and linked them into prototypes.
- This produced "hundreds of screens", narrowed to a few directions and then one.
- Yann's test question while prototyping: "How real could this concept car be?"

**Stress tests before implementation** in three areas: environment, appearance and hierarchy.
- **Environment.** The app runs on Electron and in any browser, so back/forward buttons, history and tabs had to be "easily removable". They tested "from very condensed to more spacious configurations", often relying on "Apple standards" for a native feel. Labels, icons and buttons were aligned "both vertically and horizontally in the sidebar and tabs", a change "you'll feel after a few minutes of using the app."
- **Appearance.**
  - Karri explored "mostly … with opacities of black and white", which clarified "elevation and hierarchy".
  - Core variables and the "operations we apply to them" generate aliases "for surfaces, texts, icons, and controls".
  - **LCH replaced HSL** because it is "perpetually uniform" (sic): "a red and a yellow color with lightness 50 will appear roughly equally light". LCH also handles elevations for "background, foreground, panels, dialogs, and modals".
  - Each theme used to need "98 specific variables". Now it needs three: "base color, accent color, and contrast". The contrast variable makes it possible to "automatically include super high-contrast themes" for accessibility.
  - Light and dark use the same generation method.
- **Hierarchy.** Tests ran per view type (list, board, timeline, split, fullscreen) so that "every decision worked in all cases".

**Colour polish.** They increased overall contrast and returned "to a more neutral and timeless appearance … by limiting how much chrome (blue in our case) was used in the calculations". "Text and neutral icons darker in light mode and lighter in dark mode."

**Type.** "Inter Display to add more expression to our headings", with regular Inter for everything else.

**Other changes.**
- Inbox notifications were made "more centered around the notification type", with "the faces of your teammates" emphasised.
- Headers and filters were simplified, comment alignment was reviewed, and buttons were matched to the new themes.

**Process.**
- The redesign took about six weeks. "It's always better to do a redesign quickly", or it blocks other projects and creates design debt.
- The work started at an offsite, with engineers pairing while designers worked ahead.
- It shipped behind a feature flag, dogfooded internally, went to a private beta, then rolled out to a percentage of workspaces each day.
- Milestones included documenting "behaviors of the main components of the app: sidebar, tabs, app headers, and view headers".

**Not in the post:** spacing values, font sizes or motion.

### Settings are not a design failure
<https://linear.app/now/settings-are-not-a-design-failure>. Linear Now. Adrien Griveau, 2 February 2022.

**Thesis.** The industry view is that settings are "the result of design failure"; "I think there is a misunderstanding about what settings really are."
- "Not all settings are created equal." There is product behaviour a product needs to "get right by default", and "preferences that designers deliberately" should not hold a strong opinion on.
- People customise a new computer "to create a more comfortable environment. To feel more at home."

**Decisions in Linear's settings redesign.**
- They "approached our settings redesign like an onboarding experience" and built a settings "homepage" to show what Linear can do.
- **Tutorials and tips in settings.** Some users explore settings immediately, and experienced users go deeper later. Users also "typically send us screenshots of their settings page" when something isn't working, so tutorials and tooltips live there.
- **Two levels:** workspace settings, and user-level settings (custom emoji, including import from Slack; full theme colour customisation).
- **Example:** by default Linear does not show the pointer cursor over links, to "mimic the feeling you natively have on the desktop". "Most of our users never notice it - but to some it feels really weird", so there is a toggle.

**When to add a preference.** For details that are annoying because "they are so repetitive", or "simply a matter of taste". Found "by talking to users", they "improve users' lives without changing or disrupting your product direction … they are just preferences."

**Close.** Products should "fit into people's lives, not the other way around."

---

## Vercel

### New dashboard redesign is now the default
<https://vercel.com/changelog/dashboard-navigation-redesign-rollout>. Vercel changelog, 26 February 2026. Authors: wits, Timo Lins, Christopher Skillicorn, Andrew Gadzik, Mery Kaftar.
- An opt-in beta ran from January; feedback led to "several improvements".
- Navigation is ordered so the "most common developer workflows" come first.
- Horizontal tabs were replaced by a "resizable sidebar that can be hidden when not needed".
- "Consistent tabs": one navigation pattern across team and project levels.
- "Projects as filters": switch between the team and project version of a page "in one click".
- Mobile gets a "floating bottom bar optimized for one-handed use".
- **Not in the post:** density, colour or the command menu.

### Dashboard redesign
<https://vercel.com/blog/dashboard-redesign>. Vercel blog, 20 November 2019. Evil Rabbit, Shu Ding, Paco Coursey, Christopher Skillicorn, Max Rovensky.

**Layout and lists.**
- **Overview:** makes "the most crucial project elements easily accessible": production and latest deployment status, the git connection, and links to production.
- **Projects list:** each project shows a screenshot of its latest production deployment, "a quick glimpse".
- **Project page:** highlights "the two most important aspects", production and preview deployments. Previews can be filtered by team member.
- **Deployment page:** logs appear inline, can be filtered by function or build output, and copy "in a single click".

**Status in the browser tab.** For users with many tabs open, tab icons and titles carry more information. On the deployment inspector, the tab icon shows the status: "queued, building, error, or ready".

**Domains.** Setup guides users through "warning and valid/ready states".

**Performance.** "Any great user experience demands great performance." Time to first meaningful paint fell by over 1.2s through:
- preconnecting origins and prioritising critical API calls;
- memoisation, and batched updates, which cut re-renders "by 20%";
- SWR for realtime data.

**Not in the post:** type, colour, density, empty states, keyboard or light/dark.

### Geist: Colors
<https://vercel.com/geist/colors>. Vercel Geist design system, undated.

**Scales.** Ten: backgrounds, gray, gray-alpha, blue, red, amber, green, teal, purple, pink. "P3 colors are used on supported browsers and displays."

**Steps 100–1000, each with one job:**

| Step | Job |
|---|---|
| 100 | "Default background" |
| 200 | "Hover background" |
| 300 | "Active background" |
| 400 | "Default border" |
| 500 | "Hover border" |
| 600 | "Active border" |
| 700 | "High contrast background" |
| 800 | "Hover high contrast background" |
| 900 | "Secondary text and icons" |
| 1000 | "Primary text and icons" |

So steps 1–3 are component backgrounds, 4–6 are borders, 7–8 are high-contrast backgrounds and 9–10 are "accessible text and icons".

**Backgrounds.** Background 1 is the "Default element background", used especially "when color is being placed on top". Background 2 "should be used sparingly when a subtle background differentiation is needed."

**Rules.**
- Solid gray is the default for "text, icons, fills, borders, and dividers". Gray-alpha is only for cases "when the background should show through, such as in shadows or overlays".
- Borders prefer solid gray. "Keep the divider inside the border": "Overlapping alpha borders make intersections stand out."
- Shadows stay translucent: "Opaque shadows leave a gray halo."
- On Background 1, colour 1 works as hover and colour 2 as active. Small elements like badges use colour 2 or 3 as their fill.

**Not on the page:** light/dark method.

### Geist: Command Menu
<https://vercel.com/geist/command-menu>. Vercel Geist, undated.

**What it is and when to use it.**
- "Launch a set of actions as a full-screen overlay", as "a global, keyboard-first command palette".
- Use `Menu` for a visible trigger on one resource and `ContextMenu` for right-clicking a row.
- Split items into pages once a flat list passes "roughly 30 items or span[s] multiple resource types".

**Behaviour.**
- ⌘K / Ctrl+K is "a global shortcut"; do not reuse it for in-page filters.
- Keep the query when going back from a sub-page, so "the user's typing isn't lost".
- Trap focus while open and restore it on close.
- With empty input, show recent or default items.

**Content.**
- Items are Title Case verb phrases ("Deploy Project"): "CommandMenu commands act, not browse."
- Placeholders are sentence case, name the scope and end with "…" ("Search projects…"). Bare "Search…" is wrong because "it doesn't name the scope".
- Group headings are Title Case, "1–2 words".

**Keys and accessibility.**
- Up/Down move, Enter activates, Escape closes, and Backspace on empty input "pops the page stack".
- Put `aria-live="polite"` on the result count.
- Show each item's keybind in a `Kbd` slot.

---

## Graphite

### Pull Request Inbox
<https://graphite.com/docs/use-pr-inbox>. Graphite docs, undated.

**Model.** An "'email client' for your PRs", to see "which PRs need your attention". It shows only PRs from your chosen default repositories.

**Sections.** "Six default sections": "Needs your review", "Approved", "Returned to you", "Merging and recently merged", "Drafts", "Waiting for review". These are named by what the PR needs from you or where it stands.

**Customising sections.**
- Add sections with custom filters.
- Edit one from a ⚙️ in the section header.
- Reorder by dragging, in the left menu or the section itself.
- Share a section's filters as a link, optionally swapping in the teammate's username. Sharing is "a one-way export".

**Search.** Fuzzy search across PR title, description, author and more, opened with `cmd + k`.

**Not on the page:** row content, density or status display.

### PR Page overview
<https://graphite.com/docs/pr-page-overview>. Graphite docs, undated.

**Layout.**
- The sections are Stack, Description, Discussion, a PR info and status panel in the "top right of the page", the file tree and diff, and review controls.
- "Finish review" is fixed at the top, with alternatives at the bottom of the diff.

**Status panel.**
- Review status (waiting on reviewers, or ready to merge).
- Checks as an "expandable toggle".
- Reviewers, with hover actions to remove or re-request.
- Labels, assignees and related tasks.
- A Preview entry, shown only when a deploy-preview URL is detected.

**Diff and comments.**
- The file tree is "expanded by default next to the diff". Collapsed, it becomes "a table of contents visualizer on the left".
- Generated files are hidden by default.
- Line actions appear on hover.
- Comments submit with Cmd+Enter or a "blue up arrow". Batched comments are counted in the "Finish review" button.

**Keys.**
- **F** toggles the file tree.
- **R** then **C**, **N**, **A** or **Y** comments, requests changes, approves, or quick-approves.

---

## Cursor

### Introducing Cursor 2.0 and Composer
<https://cursor.com/blog/2-0>. Cursor blog, 29 October 2025, Cursor Team.
- The interface is "more focused", "centered around agents rather than files", so users "focus on the outcomes you want while agents take care of the details".
- Files can still be opened, or users can switch back to the classic IDE.
- Many agents can run in parallel "without them interfering with one another" (git worktrees or remote machines).
- It is "much easier to quickly review the changes an agent has made".
- A native browser tool lets the agent test its own work.
- **Not in the post:** layout specifics, keyboard or visual design.

### Direct agents with visual prompts in Design Mode
<https://cursor.com/blog/design-mode>. Cursor blog, 5 June 2026. Erik Nilsson, Ian Huang and Ryo Lu.

**Premise.** "UI work tends to be spatial", so chat is supplemented with pointing and marking, "without leaving the running product".

**Inputs.**
- Click to select an element.
- Multi-select, to "make one match the other" or adjust a group.
- Draw: "circle a crowded section, box in a region".
- Voice.

**What the agent sees.**
- "The annotation sits over a frozen frame of the viewport."
- Each selection sends the element's identity (xpath, component, attributes, computed styles, props) and a screenshot.

**Workflow.** Edits queue, so you can "send another edit before the first one has finished". The page hot-reloads when agents finish.

**Not in the post:** keyboard shortcuts.

---

## Resend

### Rebranding Resend: The Product
<https://resend.com/blog/rebranding-resend#the-product>. Resend blog. Giovana Yahiro, Zeh Fernandes and Zeno Rocha. Created 1 July 2025; updated 9 July 2026.

**The Product** (whole section, near verbatim). "We're not just updating the logo.svg file, and calling it a day." The product is updated "to match the new visual identity":
- "Many UI elements were redesigned based on physical materials." The image caption reads "New buttons inspired by glass and metal".
- "Entry points like the authentication pages were also retouched." Caption: "New authentication page".
- "These individual component updates, alongside the new colors and typography, make the dashboard feel more distinct and elevated." Caption: "New dashboard look-and-feel".

**The Typography.**
- "We wanted to be bold": "Unlike many tech products, we settled on a serif typeface for our headline font."
- Domaine is the serif "for editorial headlines to convey elegance".
- Favorit is used "for subheadings where the serif is not suitable".
- Inter remains "our primary font for body text".

**The Colors.**
- "Resend is dark mode first."
- "While we launched with a pure black & white palette, we wanted to reflect more natural colors". They are "introducing gradients and gray tones to add a premium touch and texture."
- New shades: "Eggshell" extends White, "Iron" extends Black, and "Stone" and "Zinc" are new. The source: "The exploration of physical materials inspired us."

**Brand context.**
- **Old logo:** made in about five minutes, by typing "Resend" in Aeonik.
- **New symbol:** stands for friction removal, speed and "intention": "a single stroke … Bold, minimal, and purposeful", built "for developers who value clarity, precision, and tools that stay out of the way."
- **Physical objects:** used since a Rubik's Cube on the first landing page. They "double down on the concept of physicality with 3D forms, real-world materials, and textures" so the product feels "solid, trustworthy, and built to last."
- **Process:** "hundreds of variations" with outside designers.

**Not in the post:** UI sizes, spacing, layout, density, borders, icons, motion, status display or empty states.

### Introducing Light Mode
<https://resend.com/blog/introducing-light-mode>. Resend blog, by Zeh Fernandes. Created 20 January 2024; updated 27 August 2026.

**Why.** At "dozens of thousands of users", some found dark mode "difficult for some to use". The goal is for whole organisations, "not just technical users", to collaborate, "primarily for accessibility purposes".

**Scope.** The brand stays dark. "All marketing communications, landing pages, and public pages will continue to use our original, dark brand colors exclusively". Light mode covers the dashboard and the docs.

**Method.**
- "This wasn't a one-to-one conversion from black to white."
- They ran colour experiments in Figma first. "When designing for a light background, many colors had their lightness and saturation adjusted to ensure legibility." They also weighed "the contrast ratio between the background and foreground colors" (no figures given).
- Radix Colors, imported as CSS variables into Tailwind, covered "approximately 70% of our needs". The greys are Radix slate alpha (`slate-alpha.css`, `slate-dark-alpha.css`, mapped `slate 1: var(--slate-a1)` …).
- Lottie animated icons are inverted with `filter:invert(1)` "to avoid generating new JSON files for each color."
- The rest was hand-tuned with Tailwind's `dark:` variant. For example, "in light mode, the sidebar has a background color, but not in the dark mode."

**Switching.**
- Dark is the default; press `M` in the dashboard to switch.
- The docs have a theme toggle "on the top right corner".
- Following the system theme is not mentioned.

### Improved Logs Visibility
<https://resend.com/changelog/improved-logs-visibility>. Resend changelog. Published 2 February 2026; updated 9 July 2026.

**List.**
- Search by log ID, to "jump directly to a log entry when debugging".
- "Multi-select status filters": All, Errors ("only failed requests"), Success, or specific HTTP codes ("like 403 or 429").
- CSV export respects the filters.

**Detail.**
- Request and response bodies "with proper syntax highlighting" and "one-click copy".
- Failed 403s get "contextual error summaries that explain why the request failed and how to fix it".
- For domain-verification errors, the domain is highlighted in the body's "from" field, which "immediately shows which domain needs attention".
- A "Help me fix" button opens a drawer with the raw response, tailored guidance and quick links.

**Not in the post:** how status is drawn in the list, timestamps, colours or keyboard.

---

## Raycast

### The New Raycast
<https://www.raycast.com/blog/the-new-raycast>. Raycast blog, 14 May 2026, Thomas Paul Mann. Public beta.

**Visual layer.** "Every pixel is new." It is meant to "sit naturally inside macOS Tahoe" while keeping the "professional feel that long-time users care about". "Liquid Glass is used in tasteful ways to enhance the functional nature of a launcher." The aim is that it "stays familiar and feels fresh at the same time".

**Search and keys.**
- Root Search now includes files, folders and contacts. Spotlight "never gave us the speed or consistency we needed", so Raycast wrote its own indexer.
- The hotkey recorder handles single-tap modifiers like `fn`, left and right modifiers separately, and international keyboards. Hotkeys are "core to how people use Raycast".

**Other changes.**
- Quick AI and AI Chat share "the same composer".
- Settings "got a whole revamp".
- Tags make "a few hundred" snippets and quicklinks manageable.
- "Larger font sizes" are listed as missing from the beta.

**Not in the post:** colour values, type, the action panel or motion.

### Action Panel
<https://manual.raycast.com/action-panel>. Raycast Manual, undated.

**What it is.** Every item has a panel of "contextual actions tailored to it".

**Keys.**
- ⌘K opens the panel. "Make it a habit to press ⌘K … whenever you're unsure."
- ↵ runs the primary action without opening the panel. ⌘↵ submits a form. Esc closes the panel or goes back.

**Structure.**
- The primary action is "displayed prominently at the top" and runs on ↵.
- Every action shows its shortcut on the right, so users learn to trigger it directly.
- Actions are grouped in sections (Favorites, Configure, Deeplink, Manage).
- A "Search for actions…" field filters fuzzily. While searching, results show "in a single flat list regardless of their original sections".
- Submenus can hold inline custom views, such as a hotkey recorder ("Press keys to assign").
- Delete Hotkey and Delete Alias appear only when something is assigned.
- Extension actions can be marked destructive, "shown in red".

### Prepare an Extension for Store
<https://developers.raycast.com/basics/prepare-an-extension-for-store>. Raycast developer docs, undated.

**Naming.** Titles follow the Apple Style Guide (Title Case). Command titles are "`<verb> <noun>`" or "`<noun>`" ("Create Task", not "New Task"), and "Avoid articles".

**Subtitles.** A subtitle adds context; "Don't use subtitles as descriptions"; drop it if it nearly repeats the title.

**Action panel.**
- Action names are Title Case ("Copy to Clipboard", not "Copy url").
- "Provide icons for actions if there are other actions with icons in the list."
- Actions that open a submenu end with "…" and don't repeat the parent name ("Set Priority…" → "Low", "Medium", "High").

**Navigation.** Push screens with the Navigation API and "avoid introducing your own navigation stack". Don't change `navigationTitle` in the root command, and "avoid long titles".

**Empty and loading.**
- Customise the "No results" view.
- Avoid the "flickering empty state view": don't return an empty list before data arrives; show the loading indicator instead.

**Fields and assets.**
- Placeholders on all text fields. "Don't leave the search bar without a placeholder."
- Icons must work in light and dark themes.
- Screenshots should not mix light and dark themes.

**Description copy.** Lead with what people can do; drop filler like "quickly" or "the fastest way to".

---

## Railway

### Buy Domains on Railway, New Layout, AI Agent Panel
<https://railway.com/changelog/2026-03-06-domains-ui-layout>. Railway changelog #0280, 6 March 2026.

**Layout.**
- "Less in the way. More room to work."
- "The navigation has moved to the left", into "a persistent sidebar that stays out of your canvas and lets your infrastructure take up the space it deserves … your project, your environment, your services. Front and center." "(Without the IE6 style bars on top.)"
- The top now holds the activity feed, notifications and the AI Agent Panel.

**Loading and status fixes.**
- Smart Diagnosis used to show only a loading spinner. It now shows what it is doing: "searching build logs, checking environment status".
- Deployment logs got a loading state.
- Environment logs no longer run off the bottom of the screen.
- A banner may ask users to reconnect GitHub.

### Projects: Project canvas
<https://docs.railway.com/projects#project-canvas>. Railway docs, undated.
- The canvas is "the default view for a project". From it, users manage services and environments or select a service to see its configuration.
- `Settings` sits at the top right of the canvas.
- Settings has tabs General, Members and Danger. Delete Project and service deletion sit under Danger.
- **Not on the page:** how services are drawn, grouping, status or keyboard.

### The Basics
<https://docs.railway.com/overview/the-basics>. Railway docs, undated.
- The dashboard is the "main entrypoint", listing projects by when you last opened them.
- A project is "a capsule for composing infrastructure".
- Each service has tabs: Variables, Metrics ("an essential overview of CPU, memory, and network usage"), Settings, and Backups when a volume is attached.
- Destructive backup actions sit in "the backup's 3-dot menu". Schedule editing is a button "on the header".
- **Not on the page:** status display, command palette or keyboard.

---

## Things

### Night and Day
<https://culturedcode.com/things/blog/2018/09/night-and-day/>. Things blog, 24 September 2018, by Mick. This is the whole post:
- Things 3.7 for Mac "has only one new feature, but the difference is night and day."
- The appearance "automatically adapts to your environment in macOS Mojave, with a finely tuned Dark Mode".
- It is offered as an option even when Mojave is in Light Mode, and on older macOS, via View > Appearance.
- **Not in the post:** how the dark palette was designed. Colour method, greys, contrast and elevation are not mentioned (checked against the raw page).

### Things for OS 26
<https://culturedcode.com/things/blog/2025/09/things-for-os-26/>. Things blog, 15 September 2025, by Mick. Things 3.22.

**Shape, spacing and glass.**
- The app icon was refined to stay "familiar at a glance and unmistakably Things", in four variants (Default, Dark, Tinted, Clear).
- Curvature was adjusted across "windows, to-dos, dialogs, and controls".
- Spacing is wider and "feels a bit more relaxed".
- The sidebar gets "a touch of glass" that "lets a hint of color shine through".

**Motion.** "It's more than looks – it also feels new." "Glassy buttons … respond to your touch with a subtle glow and scale." The Magic Plus button has a "liquid nature – it ever so slightly deforms its shape in response to your movements."

**Not in the post:** numeric spacing, type or colour values.

---

## Flighty

### Behind the Design: Flighty
<https://developer.apple.com/news/?id=970ncww4>. Apple Developer News, "Behind the Design" (2023 Apple Design Award winners), 5 June 2023. Ryan Jones, founder, is the only person quoted.

**Goal.** "Travel can be a high-stress situation." "We want Flighty to work so well that it feels almost boringly obvious."

**Hierarchy.** The app "puts key information front and center with an immediately understandable interface". Its look "mirrors time-honored airport design conventions".

**The departure-board analogy.** Live Activities and the Dynamic Island "recall airport signage conventions". "That's our real-world analogy … Those airport boards have one line per flight, and that's a good guiding light — they've had 50 years of figuring out what's important."

**Always-present information.** "There's something comforting about information always being there." Examples:
- Not having to recompute "I have to be at the gate in 32 minutes" … "Now I have to be there in 29 minutes".
- Forgetting your seat number the moment you put the pass away.

**Designing for when it goes wrong.** "We really have to shine when things go awry." Every user will lose their connection at some point: "Whenever [someone] takes off, we have to assume that we won't see them again until they land." So before takeoff the Dynamic Island switches to "flight progress bars and counters, displaying minimal presentation in a simple circular chart that tracks a flight's duration". This display keeps working without new data.

**Process.**
- "It's so tempting to start pulling from your existing asset library".
- To avoid old ideas, the team makes 20 concepts per design ("It's what fits on a sheet of paper"). "You get to six or seven ideas and think, 'OK, that's it' … then you try it and it's not bad at all."
- The process is "comprehensive" but "not always fast".

**Not in the article:** colour, type, how delays are drawn, haptics or motion.

### Flighty product tour (homepage)
<https://flighty.com/>. Flighty, undated. Marketing page.
- **Headline:** "Get the truth when you travel". The pitch: "pilot-grade data that you can actually understand", "all at a glance", and "Never stop and stare at a flight board again."
- **Phases:** the page is organised as "Preflight", "At the airport" and "After landing".

**Notification copy.** Each sample is a route header, a short state and one line of detail:
- "Gate changed" / "Changed to ORD Terminal 2 • Gate 7"
- "Delayed 45m" / "↗ FRA 6:30pm (45m late)"
- "Flight changed" / "New Departure: 8:28pm (was 11:30pm)"
- "Landed" / "It's 6:32am (22m early)"
- "Good morning! Your flight today is on time."

The pattern is to state the change and the new value, with the old value in brackets.

**Explaining delays.**
- "See why you're delayed." The inbound plane is tracked 25 hours ahead, and delays are predicted "up to 6 hours before the airline says anything".
- An ATC advisory example says what it does and does not affect: "Some flights to JFK (but not this flight currently) are grounded", with "Probability of extension is 30-60%".

### Live Activities and widgets
<https://flighty.com/help/live-activities-widgets>. Flighty help centre, undated.
- Live Activities sit on the Lock Screen, readable "without unlocking your phone or opening the Flighty app".
- They show "departure countdowns, gate changes, taxi time, and arrival progress".
- They start "once a flight is active" and keep updating in the background, including over in-flight "Messaging" Wi-Fi.
- Widgets track your flight or a friend's.
- **Not on the page:** visual states, colours or settings.

---

## Readwise Reader

### Reader product tour
<https://readwise.io/read>. Readwise, undated. Marketing page.
- **Headline:** "The first read-it-later app for power readers"; "All your reading in one place."
- **Triage:** modelled on "Superhuman's fun, game-like triage" ("Content overload, conquered").
- **Keyboard:** "Keyboard-based reading": "Glide through your documents without ever using the mouse", covering navigation, highlighting and annotation. Screenshots show "The inbox with the command palette open".
- **Other claims:** "Customizable to match the way your brain works", and highlighting "as a first-class feature".
- **Not on the page:** panes, type options or dark mode.

### Appearance and typography (FAQ)
<https://docs.readwise.io/reader/docs/faqs/appearance>. Readwise docs, undated.

**Type controls** open from an `Aa` icon.
- Serif and sans options, "including Atkinson Hyperlegible and OpenDyslexic".
- Font size: "The default is 20px", range 14–80px, with `Shift + -` and `Shift + =`.
- Line spacing "Defaults to 1.4" (`Shift + :` / `Shift + "`).
- Line width (web): "Defaults to medium" (`Shift + ,` / `Shift + .`).

**Themes.**
- Light, dark and "auto" (follows the OS). `Cmd/Ctrl + Option + T` toggles the theme.
- On mobile, reading themes Crisp (default), Sepia, Soft, Slate, Ink and Night each have light and dark variants. "Night" "stays dark in both versions".

**Panels and pages.**
- Left panel toggles with `[` and right panel with `]`. "Side panel visibility by default" is an account preference.
- Paged scroll is vertical, so text selection across pages and the side-panel swipe gestures keep working.
- Long-form view hides the "action-heavy bottom bar" so progress and appearance gain prominence.

---

## Tensions with graeae's rules

One line each: the source's principle → the graeae rule it conflicts with.

- Linear keeps borders and separators, just fewer and softer (behind-the-latest-design-refresh) → DESIGN.md **Tone Not Lines Rule** / "Don't draw borders between surfaces".
- Vercel Geist reserves three steps of every scale (400–600) for borders and dividers (geist/colors) → **Tone Not Lines Rule**.
- Linear themes are generated from a base colour **and an accent colour** (how-we-redesigned; refresh) → **One Eye Rule** ("Never a button fill, link colour, focus ring or selection") and the owner's rejection of "a brand accent sprayed over every control".
- Graphite's comment submit is a "blue up arrow" (pr-page-overview) → **One Eye Rule** (no colour on controls).
- Vercel Geist offers seven hue scales (blue, red, amber, green, teal, purple, pink) for general UI use (geist/colors) → **One Meaning Rule** ("A colour never decorates"; three colours, one meaning each).
- Vercel shows deployment status ("queued, building, error, or ready") in the tab icon (dashboard-redesign) → DESIGN.md Mark: the favicon is "the same bare three dots". This is not a named rule, but the favicon is fixed.
- Linear uses Inter Display "to add more expression to our headings" (how-we-redesigned) → DESIGN.md Typography: "Display Font: none; the system has no display face".
- Resend uses a serif headline face (Domaine) plus Favorit and Inter (rebranding) → "Don't use … any face besides Geist and Geist Mono".
- Resend adds "gradients and gray tones … premium touch and texture" and buttons "inspired by glass and metal" (rebranding) → "Flat, layered by tone" (Elevation & Depth) and "Nothing is decorated" (Overview).
- Resend's "3D forms, real-world materials, and textures" (rebranding, brand section) → "Don't add decorative drawings that do no job".
- Things and Raycast add glass (Things: "a touch of glass … a hint of color" in the sidebar; Raycast: "Liquid Glass") → "Flat, layered by tone" and "keep every surface … grey".
- Things' buttons "respond … with a subtle glow and scale" and a button that "deforms its shape" (things-for-os-26) → DESIGN.md Overview: "Motion is short and quiet".
- Resend tunes light mode per component with Tailwind `dark:` (the sidebar has a background in light only) (introducing-light-mode) → **One Block Rule** ("a new theme changes no component").
- Raycast's destructive actions are "shown in red" at rest (action-panel) → DESIGN.md Buttons, Destructive: "rests as a ghost button … and turns stop-red on hover".
- Linear's settings are designed "like an onboarding experience", with tutorials and tips (settings-are-not-a-design-failure) → PRODUCT.md Principle 3: "no onboarding tours".
- Flighty's notification copy uses exclamation marks ("Good morning! …"; homepage "Finally!") (flighty.com) → **Plain Words Rule** ("no exclamation marks").
- Railway may show a banner asking users to reconnect GitHub (changelog 2026-03-06) → PRODUCT.md "No banners on arrival". Railway does not say when the banner appears.
- Vercel (command menu) and Raycast (actions, titles) require Title Case labels → graeae's labels are sentence case ("Share screen", "Let back in", "Watch everything"). This is a convention in DESIGN.md/PRODUCT.md examples, not a named rule.
- No source shows a day of the week, so none conflicts with "No day of the week anywhere".
