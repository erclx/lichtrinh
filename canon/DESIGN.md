---
themes:
  - ':root'
  - ":root[data-theme='dark']"
reviewed: 2026-11-21
---

# Design

Values live in `src/index.css`, light on `:root` and dark on `:root[data-theme='dark']`, an attribute the head script in `index.html` sets from the device scheme. This record holds the intent.

## Overview

Calm, large, and plain for an older traveler reading on an iPhone. Near-black controls sit on a pale ground, the type is big, and soft pastels only ever say what kind of thing an entry is. Every screen exists in light and dark and follows the device.

## Colors

- A pastel names an entry's kind and nothing else, so a state, a button, or a selection never takes one.
- A destructive action takes the foreground ink, so delete reads by its label and its confirm sheet rather than by red.
- Muted text holds at least 7:1 against the ground in both themes, and stays above 4.5:1 on the muted fill.

| Role                 | Property                 | Intent                                         |
| -------------------- | ------------------------ | ---------------------------------------------- |
| background           | `--background`           | page ground                                    |
| foreground           | `--foreground`           | body text and titles                           |
| card                 | `--card`                 | raised surfaces such as cards and entry rows   |
| card-foreground      | `--card-foreground`      | text on a card                                 |
| popover              | `--popover`              | sheets, dialogs, and menus                     |
| popover-foreground   | `--popover-foreground`   | text on a sheet, dialog, or menu               |
| primary              | `--primary`              | every press-me control and the selected state  |
| primary-foreground   | `--primary-foreground`   | text and icons on primary                      |
| secondary            | `--secondary`            | unselected chips and week-strip days           |
| secondary-foreground | `--secondary-foreground` | text on an unselected chip or day              |
| muted                | `--muted`                | quiet fills and segmented tracks               |
| muted-foreground     | `--muted-foreground`     | secondary text such as times and costs         |
| accent               | `--accent`               | hover on a quiet control                       |
| accent-foreground    | `--accent-foreground`    | text on a hovered quiet control                |
| border               | `--border`               | dividers                                       |
| input                | `--input`                | field edges                                    |
| ring                 | `--ring`                 | the focus ring                                 |
| destructive          | `--destructive`          | a destructive confirm, drawn in foreground ink |
| now                  | `--now`                  | the happening-now card for an entry of no kind |
| food                 | `--food`                 | food entries                                   |
| food-ink             | `--food-ink`             | icon and label on food                         |
| sights               | `--sights`               | sights entries                                 |
| sights-ink           | `--sights-ink`           | icon and label on sights                       |
| rest                 | `--rest`                 | rest entries                                   |
| rest-ink             | `--rest-ink`             | icon and label on rest                         |
| transport            | `--transport`            | transport entries                              |
| transport-ink        | `--transport-ink`        | icon and label on transport                    |
| activity             | `--activity`             | activity entries                               |
| activity-ink         | `--activity-ink`         | icon and label on activity                     |

## Typography

- Nunito sets everything, and weight separates the roles, with titles and control labels at 800.
- The scale has five steps, body text sits on the base step, and nothing renders below the smallest.
- One scale holds at every width, since landscape iPad takes the desktop layout and would otherwise shrink the traveler's type.

## Spacing

- Every control's hit area reaches `--spacing-target`, and a control drawn smaller pads out to it, as the header's language and settings controls do on phone.

## Layout

- Phone is under 480 wide, tablet runs from 480 to 1023, and desktop starts at 1024, landscape iPad included.
- The middle column keeps a 40px gutter from each sidebar on desktop and 32px on tablet, whose nav keeps a label under each icon.

Draw widths: 390, 834, 1440

## Shapes

- Every one-line control is a pill, being the language toggle, the Add control, chips, and the Talk bar.

| Role  | Property       | When used                                   |
| ----- | -------------- | ------------------------------------------- |
| field | `--radius-lg`  | inputs, week-strip days, and small tiles    |
| card  | `--radius-xl`  | cards, entry rows, and two-line buttons     |
| sheet | `--radius-2xl` | sheets, dialogs, and the happening-now card |
| pill  | `rounded-full` | every one-line control                      |

## Motion

- No motion is designed yet. A row adding one honors reduced motion and keeps the change under a quarter second.

## Iconography

- Every control icon is a drawn SVG on a 24 grid with round caps, never a typed glyph or an emoji.

## Mark

- The mark is a calendar page with three pastel agenda bars, served as `public/favicon.svg` and drawn in the app by `src/components/brand-mark.tsx`.
- Its outline and rings follow the text color, while the page and the bars keep their fills in both themes.
- It sits beside the wordmark in every header.
