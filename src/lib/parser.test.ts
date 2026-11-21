import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSyllabusText,
  classifyAssessment,
  extractGradeWeight,
  extractDate,
  computeRelativeWeekDate,
} from "./syllabus-parser.ts";
import {
  buildNotionPagePayload,
  detectPropertyMapping,
} from "./notion-mapper.ts";

test("1. Multi-course header inheritance (CSE 311 -> EEE 204)", () => {
  const syllabus = `
### CSE 311 - Database Systems
Midterm Exam on 2026-10-15 (25%)
Assignment 1 due Nov 20 (10%)

## EEE 204 - Electronics II
Lab Report 1: Op-Amp circuits due 2026-10-22 (15%)
Final Examination on 2026-12-18 (40%)
`;

  const results = parseSyllabusText(syllabus, { semesterStartDate: "2026-09-01" });
  assert.equal(results.length, 4);

  assert.equal(results[0].courseCode, "CSE 311");
  assert.equal(results[0].type, "Midterm");
  assert.equal(results[0].dueDate, "2026-10-15");

  assert.equal(results[1].courseCode, "CSE 311");
  assert.equal(results[1].type, "Assignment");

  assert.equal(results[2].courseCode, "EEE 204");
  assert.equal(results[2].type, "Lab");
  assert.equal(results[2].dueDate, "2026-10-22");

  assert.equal(results[3].courseCode, "EEE 204");
  assert.equal(results[3].type, "Final");
  assert.equal(results[3].dueDate, "2026-12-18");
});

test("2. Banglish / WhatsApp notice parsing ('CSE 311 quiz 2 on 25/11/2026 - 10 marks')", () => {
  const notice = "CSE 311 quiz 2 on 25/11/2026 - 10 marks";
  const results = parseSyllabusText(notice);

  assert.equal(results.length, 1);
  const item = results[0];
  assert.equal(item.courseCode, "CSE 311");
  assert.equal(item.type, "Quiz");
  assert.equal(item.dueDate, "2026-11-25");
  assert.equal(item.weightPercent, 10);
  assert.match(item.title, /Quiz 2/i);
});

test("3. Relative 'Week 6' date computation based on semester start", () => {
  // Semester starts 2026-09-01 (Tuesday)
  // Week 1 Mon is 2026-08-31
  // Week 6 Friday is 2026-10-09
  const week6Date = computeRelativeWeekDate(6, null, "2026-09-01");
  assert.equal(week6Date, "2026-10-09");

  const raw = "Midterm Exam scheduled for Week 6 (25%)";
  const results = parseSyllabusText(raw, { semesterStartDate: "2026-09-01", defaultCourseCode: "MAT 120" });

  assert.equal(results.length, 1);
  assert.equal(results[0].dueDate, "2026-10-09");
  assert.equal(results[0].type, "Midterm");
  assert.equal(results[0].weightPercent, 25);
});

test("4. Relative 'Week 6 Friday' and custom days", () => {
  const dateFri = computeRelativeWeekDate(6, "Friday", "2026-09-01");
  const dateMon = computeRelativeWeekDate(6, "Monday", "2026-09-01");
  assert.equal(dateFri, "2026-10-09");
  assert.equal(dateMon, "2026-10-05");

  const text = "Lab 4 Report Due: Week 6 Monday (10 pts)";
  const results = parseSyllabusText(text, { semesterStartDate: "2026-09-01", defaultCourseCode: "CSE 220" });

  assert.equal(results.length, 1);
  assert.equal(results[0].dueDate, "2026-10-05");
  assert.equal(results[0].weightPercent, 10);
});

test("5. MISSING_DATE flag on undated tasks", () => {
  const text = "Term Project Proposal & Schema design (15%)";
  const results = parseSyllabusText(text, { defaultCourseCode: "CSE 311" });

  assert.equal(results.length, 1);
  const item = results[0];
  assert.equal(item.dueDate, null);
  assert.ok(item.flags.includes("MISSING_DATE"));
  assert.equal(item.weightPercent, 15);
  assert.equal(item.type, "Project");
});

test("6. Grade weight extraction across varied notations", () => {
  const w1 = extractGradeWeight("Final Exam [30%]");
  assert.equal(w1.weight, 30);

  const w2 = extractGradeWeight("Quiz 1 (15 marks)");
  assert.equal(w2.weight, 15);

  const w3 = extractGradeWeight("Homework 2 - 10 pts");
  assert.equal(w3.weight, 10);

  const w4 = extractGradeWeight("Term Paper Weight: 25.5%");
  assert.equal(w4.weight, 25.5);
});

test("7. Assessment type classification keywords", () => {
  assert.equal(classifyAssessment("Pop Quiz 1"), "Quiz");
  assert.equal(classifyAssessment("Class Test 2 (CT-2)"), "Quiz");
  assert.equal(classifyAssessment("Midterm Examination"), "Midterm");
  assert.equal(classifyAssessment("Final Viva & Comprehensive Exam"), "Final");
  assert.equal(classifyAssessment("Lab Report 3"), "Lab");
  assert.equal(classifyAssessment("Capstone Project Presentation"), "Project");
  assert.equal(classifyAssessment("Homework Problem Set 4"), "Assignment");
});

test("8. Title cleanup and DUPLICATE_IN_BATCH flagging", () => {
  const text = `
### CSE 311
Assignment 1 Due: 2026-10-01 (10%)
Assignment 1 Due: 2026-10-05 (10%)
`;
  const results = parseSyllabusText(text);
  assert.equal(results.length, 2);
  assert.ok(results[0].flags.includes("DUPLICATE_IN_BATCH"));
  assert.ok(results[1].flags.includes("DUPLICATE_IN_BATCH"));
});

test("9. Dynamic Notion schema mapping across varied property names ('Deadline' vs 'Due Date')", () => {
  const schemaA = {
    "Task Title": { id: "p1", type: "title" },
    "Deadline": { id: "p2", type: "date" },
    "Category": { id: "p3", type: "select" },
    "Grade": { id: "p4", type: "number" },
  };

  const mappingA = detectPropertyMapping(schemaA);
  assert.equal(mappingA.titleProp, "Task Title");
  assert.equal(mappingA.dateProp, "Deadline");
  assert.equal(mappingA.typeProp, "Category");
  assert.equal(mappingA.weightProp, "Grade");

  const schemaB = {
    "Name": { id: "p1", type: "title" },
    "Due Date": { id: "p2", type: "date" },
    "Status": { id: "p3", type: "status" },
    "Weight %": { id: "p4", type: "number" },
  };

  const mappingB = detectPropertyMapping(schemaB);
  assert.equal(mappingB.titleProp, "Name");
  assert.equal(mappingB.dateProp, "Due Date");
  assert.equal(mappingB.typeProp, "Status");
  assert.equal(mappingB.weightProp, "Weight %");
});

test("10. Course relation payload generation with and without matched course ID", () => {
  const schema = {
    "Name": { id: "p1", type: "title" },
    "Due Date": { id: "p2", type: "date" },
    "Course": { id: "p3", type: "relation", relation: { database_id: "courses-db" } },
  };

  const item = {
    id: "deliv-1",
    courseCode: "CSE 311",
    title: "Midterm Exam",
    rawLine: "Midterm Exam",
    type: "Midterm" as const,
    dueDate: "2026-10-15",
    rawDateStr: "2026-10-15",
    weightPercent: 25,
    flags: [],
  };

  // With matched course ID
  const payloadWithRel = buildNotionPagePayload(item, schema, "course-page-999");
  assert.equal(payloadWithRel["Name"].title[0].text.content, "Midterm Exam");
  assert.deepEqual(payloadWithRel["Course"], { relation: [{ id: "course-page-999" }] });

  // Without matched course ID -> title is prefixed with [CSE 311]
  const payloadWithoutRel = buildNotionPagePayload(item, schema);
  assert.equal(payloadWithoutRel["Name"].title[0].text.content, "[CSE 311] Midterm Exam");
  assert.equal(payloadWithoutRel["Course"], undefined);
});

test("11. Notion page payload omits date property when dueDate is null", () => {
  const schema = {
    "Name": { id: "p1", type: "title" },
    "Due Date": { id: "p2", type: "date" },
    "Weight %": { id: "p3", type: "number" },
  };

  const undatedItem = {
    id: "deliv-2",
    courseCode: "MAT 120",
    title: "Optional Assignment",
    rawLine: "Optional Assignment (5%)",
    type: "Assignment" as const,
    dueDate: null,
    rawDateStr: null,
    weightPercent: 5,
    flags: ["MISSING_DATE" as const],
  };

  const payload = buildNotionPagePayload(undatedItem, schema);
  assert.equal(payload["Due Date"], undefined);
  assert.equal(payload["Weight %"].number, 5);
});
