export type DeliverableType =
  | "Midterm"
  | "Final"
  | "Exam"
  | "Assignment"
  | "Lab"
  | "Quiz"
  | "Project";

export type DeliverableFlag = "MISSING_DATE" | "DUPLICATE_IN_BATCH";

export interface ParsedDeliverable {
  id: string;
  courseCode: string;
  title: string;
  rawLine: string;
  type: DeliverableType;
  dueDate: string | null;
  rawDateStr: string | null;
  weightPercent: number | null;
  flags: DeliverableFlag[];
}

export interface ParserOptions {
  semesterStartDate?: string; // Default "2026-09-01"
  defaultCourseCode?: string; // Fallback if no course is specified
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DAY_OF_WEEK_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const STOP_WORDS = new Set([
  "ON", "IN", "AT", "BY", "TO", "DUE", "WEEK", "FROM", "YEAR", "DATE",
  "FOR", "WITH", "THE", "AND", "PAGE", "UNIT", "CH", "SEC", "LAB", "MID", "HW"
]);

export function extractCourseCode(text: string): { dept: string; num: string } | null {
  const matches = text.matchAll(/\b([A-Za-z]{2,5})[\s\-_]?([0-9]{3,4}[A-Za-z]?)\b/g);
  for (const m of matches) {
    const rawDept = m[1];
    const dept = rawDept.toUpperCase();
    const num = m[2].toUpperCase();

    // Skip stop words like "on 2026", "due 2026", "week 6"
    if (STOP_WORDS.has(dept)) continue;

    // If num looks like a 4-digit calendar year (e.g. 2024-2035) and dept was lowercase, skip
    if (/^20[2-3][0-9]$/.test(num) && rawDept === rawDept.toLowerCase()) continue;

    return { dept, num };
  }
  return null;
}

function normalizeCourseCode(dept: string, num: string): string {
  return `${dept.toUpperCase()} ${num.toUpperCase()}`;
}

function formatDateISO(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function computeRelativeWeekDate(
  weekNum: number,
  dayName: string | null,
  semesterStartDateStr: string = "2026-09-01"
): string {
  const [sy, sm, sd] = semesterStartDateStr.split("-").map(Number);
  const baseDate = new Date(Date.UTC(sy, sm - 1, sd));

  // Determine target day offset within that week
  // By default, deliverable deadlines fall on Friday (offset +4 days from Mon, or if semester starts on Tuesday/Wednesday, Friday of that week)
  const baseDayOfWeek = baseDate.getUTCDay(); // 0 is Sunday, 1 is Monday
  const mondayOffset = baseDayOfWeek === 0 ? 1 : 1 - baseDayOfWeek;
  const startMonday = new Date(baseDate.getTime() + mondayOffset * 86400000);

  let targetDayOffset = 4; // Default Friday (Mon=0, Tue=1, Wed=2, Thu=3, Fri=4)
  if (dayName && DAY_OF_WEEK_MAP[dayName.toLowerCase()] !== undefined) {
    const desired = DAY_OF_WEEK_MAP[dayName.toLowerCase()];
    // Target offset from Monday: desired === 0 ? 6 : desired - 1
    targetDayOffset = desired === 0 ? 6 : desired - 1;
  }

  const weekOffsetMs = (weekNum - 1) * 7 * 86400000;
  const targetTime = startMonday.getTime() + weekOffsetMs + targetDayOffset * 86400000;
  const res = new Date(targetTime);

  return formatDateISO(res.getUTCFullYear(), res.getUTCMonth() + 1, res.getUTCDate());
}

export function extractDate(
  text: string,
  semesterStartDateStr: string = "2026-09-01"
): { dateStr: string | null; rawMatch: string | null } {
  const semYear = Number(semesterStartDateStr.split("-")[0]) || 2026;

  // 1. Relative week: "Week 6 Friday", "Week 6", "W8", "Week 12 Thursday"
  const weekMatch = text.match(/\b(?:Week|W)\s*([0-9]{1,2})(?:\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun))?\b/i);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[1], 10);
    const dayName = weekMatch[2] || null;
    const computed = computeRelativeWeekDate(weekNum, dayName, semesterStartDateStr);
    return { dateStr: computed, rawMatch: weekMatch[0] };
  }

  // 2. ISO format: YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return { dateStr: formatDateISO(y, m, d), rawMatch: isoMatch[0] };
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    return { dateStr: formatDateISO(y, m, d), rawMatch: dmyMatch[0] };
  }

  // 4. Month Day (Year optional): e.g. "Nov 28", "Nov 28, 2026", "November 28th 2026", "Dec 5th"
  const monthDayMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-9]{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
  if (monthDayMatch) {
    const m = MONTH_NAMES[monthDayMatch[1].toLowerCase()];
    const d = parseInt(monthDayMatch[2], 10);
    const y = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : semYear;
    return { dateStr: formatDateISO(y, m, d), rawMatch: monthDayMatch[0] };
  }

  // 5. Day Month (Year optional): e.g. "28 November", "28 Nov, 2026", "5th Dec"
  const dayMonthMatch = text.match(/\b([0-9]{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+(20\d{2}))?\b/i);
  if (dayMonthMatch) {
    const d = parseInt(dayMonthMatch[1], 10);
    const m = MONTH_NAMES[dayMonthMatch[2].toLowerCase()];
    const y = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : semYear;
    return { dateStr: formatDateISO(y, m, d), rawMatch: dayMonthMatch[0] };
  }

  return { dateStr: null, rawMatch: null };
}

export function classifyAssessment(text: string): DeliverableType {
  const t = text.toLowerCase();

  // Check specific keywords with precedence
  if (/\b(mid[\s\-_]?term|mid[\s\-_]?[1-3]|midterm)\b/i.test(t)) {
    return "Midterm";
  }
  if (/\b(final[\s\-_]?exam|finals|final)\b/i.test(t)) {
    return "Final";
  }
  if (/\b(quiz|pop[\s\-_]?quiz|class[\s\-_]?test|ct[\s\-_]?[1-4])\b/i.test(t)) {
    return "Quiz";
  }
  if (/\b(lab[\s\-_]?report|lab[\s\-_]?exam|lab[\s\-_]?task|lab[\s\-_]?evaluation|lab[\s\-_]?[0-9]+|lab)\b/i.test(t)) {
    return "Lab";
  }
  if (/\b(project[\s\-_]?proposal|term[\s\-_]?project|capstone|presentation|project)\b/i.test(t)) {
    return "Project";
  }
  if (/\b(exam|viva|assessment)\b/i.test(t)) {
    return "Exam";
  }
  if (/\b(assignment|homework|hw[\s\-_]?[0-9]+|hw|problem[\s\-_]?set|task|report)\b/i.test(t)) {
    return "Assignment";
  }

  return "Assignment";
}

export function extractGradeWeight(text: string): { weight: number | null; rawMatch: string | null } {
  // Matches e.g. "20%", "(15%)", "[10%]", "15 marks", "10 pts", "10 points", "Weight: 25%"
  const percentMatch = text.match(/[([{\s]?(\d+(?:\.\d+)?)\s*%[)\]}\s]?/);
  if (percentMatch) {
    return { weight: parseFloat(percentMatch[1]), rawMatch: percentMatch[0].trim() };
  }

  const marksMatch = text.match(/[([{\s]?(\d+(?:\.\d+)?)\s*(?:marks|pts|points)[)\]}\s]?/i);
  if (marksMatch) {
    return { weight: parseFloat(marksMatch[1]), rawMatch: marksMatch[0].trim() };
  }

  const explicitWeight = text.match(/weight:\s*(\d+(?:\.\d+)?)/i);
  if (explicitWeight) {
    return { weight: parseFloat(explicitWeight[1]), rawMatch: explicitWeight[0].trim() };
  }

  return { weight: null, rawMatch: null };
}

export function cleanDeliverableTitle(
  rawText: string,
  rawDateStr: string | null,
  rawWeightStr: string | null,
  courseCode: string
): string {
  let cleaned = rawText;

  // Remove leading markdown headers (###), list markers (*, -, •, 1., 2))
  cleaned = cleaned.replace(/^[\s#*•\->]+/, "");
  cleaned = cleaned.replace(/^\d+[\.\)]\s*/, "");

  // Remove extracted date string if present
  if (rawDateStr) {
    cleaned = cleaned.replace(rawDateStr, " ");
  }

  // Remove extracted weight string if present
  if (rawWeightStr) {
    cleaned = cleaned.replace(rawWeightStr, " ");
  }

  // Remove course code prefix if present at start (e.g. "CSE 311 Quiz 2" -> "Quiz 2")
  const ccEscaped = courseCode.replace(/[-\s]/g, "[\\s\\-_]?");
  const ccRegex = new RegExp(`^${ccEscaped}[:\\s\\-_]+`, "i");
  cleaned = cleaned.replace(ccRegex, "");

  // Remove common connecting prepositions like "due on", "due by", "due:", "deadline:", "on"
  cleaned = cleaned.replace(/\b(due\s*(?:on|by|date)?[:\s]*|deadline[:\s]*|submit\s*by[:\s]*)/gi, " ");
  cleaned = cleaned.replace(/\s+on\s*$/i, "");
  cleaned = cleaned.replace(/\s+due\s*$/i, "");

  // Remove table dividers like | or extra brackets
  cleaned = cleaned.replace(/[|[\]{}()]/g, " ");

  // Clean trailing punctuation and collapse whitespace
  cleaned = cleaned.replace(/[-:_,\s]+$/, "").replace(/^[-:_,\s]+/, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // If title became empty, fallback to course code + deliverable
  if (!cleaned) {
    cleaned = "Deliverable";
  }

  return cleaned;
}

export function isActionableDeliverable(line: string): boolean {
  const l = line.toLowerCase();

  // Ignore lines that are pure course headers or general syllabus info
  if (/^(course\s*description|prerequisites?|instructor|office\s*hours?|textbooks?|grading\s*policy):/i.test(l)) {
    return false;
  }

  // Contains assessment keyword
  const hasAssessmentKw = /\b(mid[\s\-_]?term|final|exam|quiz|assignment|homework|hw|lab|project|viva|presentation|report|task|assessment|ct[\s\-_]?[1-4])\b/i.test(l);
  
  // Contains date indicator
  const hasDateIndicator = /\b(due|deadline|week\s*\d+|w\d+|\d{4}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)\b/i.test(l);

  // Contains weight or marks indicator
  const hasWeightIndicator = /%|\bmarks\b|\bpts\b|\bpoints\b/i.test(l);

  return hasAssessmentKw || (hasDateIndicator && hasWeightIndicator);
}

export function parseSyllabusText(
  rawText: string,
  options?: ParserOptions
): ParsedDeliverable[] {
  const semesterStartDate = options?.semesterStartDate || "2026-09-01";
  let activeCourseCode = options?.defaultCourseCode || "GENERAL";

  const lines = rawText.split(/\r?\n/);
  const deliverables: ParsedDeliverable[] = [];
  const seenMap = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for Course Code in the line
    const courseCodeMatch = extractCourseCode(line);
    const isHeaderLine = /^#{1,4}\s+/.test(line) ||
      /^(?:course|subject|class)[:\s]/i.test(line) ||
      (courseCodeMatch !== null && !isActionableDeliverable(line));

    if (courseCodeMatch) {
      const detectedCode = normalizeCourseCode(courseCodeMatch.dept, courseCodeMatch.num);
      if (isHeaderLine) {
        activeCourseCode = detectedCode;
        continue; // Pure header line, move to deliverables under this course
      } else {
        // Line might be an inline notice like "CSE 311 quiz 2 on 25/11/2026 - 10 marks"
        // Update active course code as well
        activeCourseCode = detectedCode;
      }
    } else if (isHeaderLine) {
      // Header line without course code, continue
      continue;
    }

    // Now check if line is an actionable deliverable
    if (!isActionableDeliverable(line)) {
      continue;
    }

    // Extract Date
    const { dateStr, rawMatch: rawDateStr } = extractDate(line, semesterStartDate);

    // Extract Grade Weight
    const { weight: weightPercent, rawMatch: rawWeightStr } = extractGradeWeight(line);

    // Classify Assessment
    const type = classifyAssessment(line);

    // Clean Title
    const title = cleanDeliverableTitle(line, rawDateStr, rawWeightStr, activeCourseCode);

    // Determine Flags
    const flags: DeliverableFlag[] = [];
    if (!dateStr) {
      flags.push("MISSING_DATE");
    }

    // Check for Duplicates in Batch
    const dedupKey = `${activeCourseCode.toLowerCase()}::${title.toLowerCase()}`;
    if (seenMap.has(dedupKey)) {
      flags.push("DUPLICATE_IN_BATCH");
      // Also tag the previously seen item if it doesn't already have the flag
      const prevIdx = seenMap.get(dedupKey)!;
      if (!deliverables[prevIdx].flags.includes("DUPLICATE_IN_BATCH")) {
        deliverables[prevIdx].flags.push("DUPLICATE_IN_BATCH");
      }
    } else {
      seenMap.set(dedupKey, deliverables.length);
    }

    deliverables.push({
      id: `deliv-${i}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      courseCode: activeCourseCode,
      title,
      rawLine: line,
      type,
      dueDate: dateStr,
      rawDateStr,
      weightPercent,
      flags,
    });
  }

  return deliverables;
}
