# DESIGN.md

Users: inventory staff at a small water utility, and the state reviewer who checks their work. They read old records all day; the screen should look like a careful records desk, not a chat app.

Starting point: Stripe's dashboard (dense tables, quiet chrome, one strong action) adapted to a document-review layout.

- Type: IBM Plex Sans (UI, 400/500/600), IBM Plex Mono (record text, quotes, dates, numbers). Scale 12 / 13 / 15 / 18 / 24 / 32.
- Color: ink #14212B, primary #0E4F5C (deep water teal) for the one main action and links, paper #F6F4EF background, surface #FFFFFF, line #DAD6CC.
  Category colors are fixed meanings and always come with a text label: Lead #A1271B, GRR #A15C07, Unknown #4A5560, Non-lead #1F6B3A. Quote highlight #F3E3A3.
- Radius: 4 (chips, inputs), 8 (panels). No shadows except a 1px line.
- Spacing: 4-pt grid; panels 16 / 24 padding.
- Numbers: tabular figures, right-aligned in tables.
- Motion: none beyond 120 ms color changes.
