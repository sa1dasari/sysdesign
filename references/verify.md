# Checking the page

Run `node scripts/check.mjs page.html --shots /tmp/shots` and read the output and the PNGs. The page is not done until each of these holds.

## Output of the script
- `page built, no script errors`. If there are errors, they name the bad expression or section.
- `no horizontal overflow` at 1280 wide. Also run with `--width 390` and read the phone screenshot.
- **The preset table.** For each preset, compare the numbers to its `note`. A note that promises "latency climbs" must be matched by the table. This is the most important check: it is how you catch a model that does not show the idea.
- The baseline row (first preset, `Reset`): failed requests 0%, busiest tier under about 75%.

## Screenshots to read
- `full-light.png` and `full-dark.png`: layout, contrast, anything cut off.
- The `arch` section: no label overflows its box, edges do not cross nodes, metrics do not wrap awkwardly.
- LLD diagrams: no overlapping labels, arrows do not pass through boxes, text fits.

## Content check
- Pick three numbers from the prose and trace each to its expression. They must match.
- Each tradeoff's `why` points at something the simulator shows.
- No sentence the reader could not act on or explain back.
