# The library

The library shows your own class material (notes, study guides, slides,
classwork) next to your LMS data, one tab per class. It reads the folder in
`LIBRARY_DIR` and never writes to it. `examples/library` has a small example
of each layout below.

## Which folders belong to a class

A class owns the top-level folders named after its **course code**, with or
without the space:

```
School/                     ← LIBRARY_DIR
  CSCI 1301/                ← CSCI 1301 (one folder per class)
    Notes/
    Classwork/
    Important Documents/
  MATH2260 Notes/           ← MATH 2260 (code + section, side by side)
  MATH2260 Classwork/
  MATH2260 Important Documents/
  Calc stuff/               ← nobody's, unless courses.json assigns it
```

To use other folder names, list them in `config/courses.json`:

```json
{ "courses": { "MATH 2260": { "folders": ["Calc stuff"] } } }
```

New classes: `docker compose run --rm init` creates `<CODE>/Notes`,
`Classwork` and `Important Documents` for every class that has no folder yet.
Add `--dry-run` to see what it would do first. It never changes existing
folders.

## How folders are shown

Any layout works: a folder without the names below is shown as a folder tree
under the class's documents. These names add structure:

| Folder | Shown as |
|---|---|
| `Notes/3 - Loops (Ch 3)/` | Unit 3 "Loops", tagged "Ch 3", in course order |
| `Notes/_Midterm 1/` | Exam prep (a leading `_`), newest first |
| `Notes/_README.md` (in any folder) | "About this folder" |
| `Notes/*.md` (loose files) | Notes & logs |
| `Notes/<other folder>/` | Course documents (e.g. `Reference/`) |
| `Classwork/<anything>/` | Classwork, nested folders allowed |
| `Important Documents/` | Syllabus, rubrics, schedules |

The unit with the most recent dated material opens by default.

## File names

- **Dates:** a `YYYY-MM-DD ` prefix dates the item (`2026-09-29 Study Guide 3.7.html`).
  Future dates are marked "upcoming".
- **One item, several formats:** files that differ only by extension
  (`Guide.html` + `Guide.pdf`) show as one item; HTML opens first, then
  Markdown, then PDF.
- **Kind** comes from words in the name:

| Kind | Words |
|---|---|
| Study guide | study guide, guide, prep, formulas, exam material |
| Review | review |
| Practice | practice, sample, mock, drill, self-check |
| Notes | notes, lecture |
| Slides | slides, or any .pptx |
| Reading | reading, textbook |
| Activity | activity, worksheet, breakout, exit ticket |
| Classwork | assignment, lab 1, project 2, quiz, test, draft, presentation; code files |
| Course info | syllabus, schedule, deadlines, office hours |
| Guidelines | rubric, template, style guide, academic honesty |
| Media | video, audio and image files |

## Opening files

| Format | Opens as |
|---|---|
| HTML | Embedded in the viewer as-is (study guides keep their own styling, math and scripts), with an "Open in new tab" button |
| PDF | In the browser as-is |
| Word, PowerPoint, Excel, ODF, RTF | The PDF made by the converter (below), or a download |
| Markdown, text, CSV, code | The built-in viewer (Markdown rendered, code highlighted) |
| Images, audio, video | The built-in viewer (video and audio stream with seeking) |
| Anything else | Download |

Every item also has a download link for the original.

### Office previews

```bash
docker compose run --rm convert
```

converts every Word/PowerPoint/Excel file to a PDF in `PREVIEWS_DIR` (with
LibreOffice, no network access). It skips files whose preview is current and
removes previews whose original is gone, so run it again after adding
material.

## Skipped

Hidden files and folders (starting with `.`), Office lock files (`~$...`),
`Thumbs.db`/`desktop.ini`, `bin/` folders, and the `*_files` folders browsers
save next to a web page (still served, so the page renders).
