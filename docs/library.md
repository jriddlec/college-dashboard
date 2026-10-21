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

### Recommended naming

Names in this pattern are read exactly:

```
YYYY-MM-DD <Type> - <Topic>[ (<variant>)].<ext>     units, exam prep, classwork
<Type>[ - <Title>][ (<variant>)].<ext>              Important Documents, Reference

2026-09-24 Study Guide - 3.7 Improper Integrals.html
2026-08-20 Lecture Notes - 1.1-1.3 Areas (annotated).pdf
2026-09-14 Submission - Lab 4.pdf
Rubric - Defense Summary (old).docx
```

The **Type** sets the kind and is shown as the badge, the **Topic** is the
title, and the **variant** (`annotated`, `clean`, `v2`, `official`, a
classmate's name...) is shown as a chip. Types:

| Type | Kind |
|---|---|
| Lecture Notes, Lesson Notes, any "<Series> Notes" (e.g. "OSE Notes") | Notes |
| Slides | Slides |
| Reading, Textbook | Reading |
| Pre-Class | Pre-class |
| Activity, Worksheet | Activity |
| Recording | Audio or video (a transcript with the same name shows as its other format) |
| Study Guide, Master Study Guide | Study guide |
| Practice Problems, Practice Test, Practice Quiz, Exam Paper | Practice |
| Review | Review |
| Instructions | Assignment |
| Draft, Submission, Graded | My work |
| Rubric, Template, Guidelines | Guidelines |
| Syllabus, Schedule, Info, Setup | Course info |

Folders under Classwork go two levels deep, a category and an item
(`Labs/Lab 3`, `Defense Summaries/Defense Summary 2`); unnumbered items can be
named `YYYY-MM-DD <Title>` (`In-Class Activities/2026-09-15 Boolean Activity`)
and are dated by it. Code and data files keep the names the assignment gives
them. Set `LIBRARY_NAMING_CHECK=1` to list files that don't follow this on
**Data status**.

Exam-prep folders (`_Test 3 Material`) are matched to the exam with the same
name and number on the calendar: the next exam's folder comes first and opens
by default, past exams go last. Assignments open their classwork folder the
same way ("Lab04" ↔ `Labs/Lab 4`).

### Any other names

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

**Search** (Ctrl+K anywhere, or the box on the library pages) also looks
inside HTML, Markdown and text files, including the text of study guides built
from a template whose content lives in a script.

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
