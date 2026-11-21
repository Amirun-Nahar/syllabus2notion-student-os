import { createRequire } from "node:module";
import type { ParsedDeliverable } from "./syllabus-parser.ts";

const require = createRequire(import.meta.url);
const { Client } = require("@notionhq/client");

export interface DiscoveredDatabase {
  id: string;
  title: string;
  properties: Record<string, any>;
  url?: string;
}

export interface DiscoveredCourse {
  id: string;
  title: string;
  code?: string;
}

export interface PropertyMapping {
  titleProp: string;
  dateProp: string | null;
  typeProp: string | null;
  weightProp: string | null;
  courseRelationProp: string | null;
}

export interface StudentOSDiscoveryResult {
  tasksDatabase: DiscoveredDatabase | null;
  coursesDatabase: DiscoveredDatabase | null;
  allDatabases: DiscoveredDatabase[];
  existingCourses: DiscoveredCourse[];
  propertyMapping: PropertyMapping | null;
}

/**
 * Finds a property in a database schema matching a given Notion property type,
 * prioritizing preferred name keywords.
 */
export function findProperty(
  properties: Record<string, any>,
  targetTypes: string[],
  preferredKeywords: string[]
): { name: string; type: string } | null {
  const entries = Object.entries(properties);

  // 1. First find matching types
  const typeMatches = entries.filter(([_, def]) =>
    targetTypes.includes(def.type)
  );

  if (typeMatches.length === 0) {
    return null;
  }

  // 2. Score by preferred keywords
  let bestMatch = typeMatches[0];
  let bestScore = -1;

  for (const match of typeMatches) {
    const propName = match[0].toLowerCase();
    let score = 0;
    for (let i = 0; i < preferredKeywords.length; i++) {
      const kw = preferredKeywords[i].toLowerCase();
      if (propName.includes(kw)) {
        // Earlier keywords have higher priority
        score += 100 - i * 10;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  return { name: bestMatch[0], type: bestMatch[1].type };
}

/**
 * Detects standard Student OS property mappings for the tasks database.
 */
export function detectPropertyMapping(
  tasksSchema: Record<string, any>,
  coursesDbId?: string
): PropertyMapping {
  const titleMatch = findProperty(tasksSchema, ["title"], ["name", "title", "task", "assignment"]);
  const dateMatch = findProperty(tasksSchema, ["date"], ["due date", "due", "deadline", "date"]);
  const typeMatch = findProperty(tasksSchema, ["select", "status"], ["type", "category", "tag", "status", "kind"]);
  const weightMatch = findProperty(tasksSchema, ["number"], ["weight", "grade", "percent", "points", "marks", "%"]);

  // Look for relation property
  let courseRelProp: string | null = null;
  for (const [propName, def] of Object.entries(tasksSchema)) {
    if (def.type === "relation") {
      if (coursesDbId && def.relation?.database_id === coursesDbId) {
        courseRelProp = propName;
        break;
      } else if (/course|subject|class/i.test(propName)) {
        courseRelProp = propName;
        break;
      }
    }
  }

  return {
    titleProp: titleMatch ? titleMatch.name : "Name",
    dateProp: dateMatch ? dateMatch.name : null,
    typeProp: typeMatch ? typeMatch.name : null,
    weightProp: weightMatch ? weightMatch.name : null,
    courseRelationProp: courseRelProp,
  };
}

/**
 * Discovers and inspects Notion Student OS databases using the Notion API.
 */
export async function discoverStudentOSDatabases(
  token: string
): Promise<StudentOSDiscoveryResult> {
  const notion = new Client({ auth: token });

  // In latest Notion API versions, filter.value for databases is "data_source" (or search without filter)
  let searchRes: any;
  try {
    searchRes = await notion.search({
      filter: { property: "object", value: "data_source" },
      page_size: 100,
    });
  } catch (err: any) {
    try {
      // Fallback: search without filter to fetch all accessible workspace objects
      searchRes = await notion.search({
        page_size: 100,
      });
    } catch {
      // Fallback for older API versions where filter.value was "database"
      searchRes = await notion.search({
        filter: { property: "object", value: "database" } as any,
        page_size: 100,
      });
    }
  }

  const allDatabases: DiscoveredDatabase[] = [];

  for (const result of searchRes.results || []) {
    if (result.object === "database" || result.object === "data_source") {
      const db = result as any;
      const title = db.title?.map((t: any) => t.plain_text).join("") || "Untitled Database";
      allDatabases.push({
        id: db.id,
        title,
        properties: db.properties || {},
        url: db.url,
      });
    }
  }

  // Identify Tasks database
  // Criteria: matches Task, Assignment, Exam, Homework, Deliverable, Student OS, or has both title and date
  let tasksDatabase: DiscoveredDatabase | null = null;
  let coursesDatabase: DiscoveredDatabase | null = null;

  for (const db of allDatabases) {
    const t = db.title.toLowerCase();
    const props = Object.values(db.properties).map((p: any) => p.type);
    const hasTitle = props.includes("title");
    const hasDate = props.includes("date");

    if (!tasksDatabase) {
      if (
        /assignment|task|exam|homework|deliverable|schedule/i.test(t) ||
        (hasTitle && hasDate)
      ) {
        tasksDatabase = db;
      }
    }

    if (!coursesDatabase) {
      if (/course|class|subject/i.test(t)) {
        coursesDatabase = db;
      }
    }
  }

  // Fallbacks if not matched by name
  if (!tasksDatabase && allDatabases.length > 0) {
    // Pick the first database with both title and date, or first DB
    tasksDatabase =
      allDatabases.find((db) => {
        const types = Object.values(db.properties).map((p: any) => p.type);
        return types.includes("title") && types.includes("date");
      }) || allDatabases[0];
  }

  const existingCourses: DiscoveredCourse[] = [];

  // Query existing courses if coursesDatabase is found
  if (coursesDatabase) {
    try {
      const courseQuery = await notion.databases.query({
        database_id: coursesDatabase.id,
        page_size: 100,
      });

      for (const page of courseQuery.results as any[]) {
        if (page.properties) {
          // Find title prop
          const titleProp = Object.values(page.properties).find((p: any) => p.type === "title") as any;
          const courseTitle = titleProp?.title?.map((t: any) => t.plain_text).join("") || "Untitled Course";
          existingCourses.push({
            id: page.id,
            title: courseTitle,
          });
        }
      }
    } catch (e) {
      console.warn("Could not query courses database:", e);
    }
  }

  const propertyMapping = tasksDatabase
    ? detectPropertyMapping(tasksDatabase.properties, coursesDatabase?.id)
    : null;

  return {
    tasksDatabase,
    coursesDatabase,
    allDatabases,
    existingCourses,
    propertyMapping,
  };
}

/**
 * Builds Notion page creation payload with dynamic schema inspection.
 */
export function buildNotionPagePayload(
  item: ParsedDeliverable,
  dbSchema: Record<string, any>,
  matchedCoursePageId?: string
): Record<string, any> {
  const mapping = detectPropertyMapping(dbSchema);
  const propertiesPayload: Record<string, any> = {};

  // 1. Title property
  const titlePropName = mapping.titleProp || "Name";
  const shouldPrefixCode = !mapping.courseRelationProp || !matchedCoursePageId;
  const finalTitle = shouldPrefixCode
    ? `[${item.courseCode}] ${item.title}`
    : item.title;

  propertiesPayload[titlePropName] = {
    title: [
      {
        text: {
          content: finalTitle,
        },
      },
    ],
  };

  // 2. Date property
  if (mapping.dateProp && item.dueDate) {
    propertiesPayload[mapping.dateProp] = {
      date: {
        start: item.dueDate,
      },
    };
  }

  // 3. Type / Category property (select or status)
  if (mapping.typeProp) {
    const propDef = dbSchema[mapping.typeProp];
    if (propDef.type === "select") {
      // Find matching select option case-insensitively or supply item.type
      const options = propDef.select?.options || [];
      const match = options.find(
        (opt: any) => opt.name.toLowerCase() === item.type.toLowerCase()
      );
      propertiesPayload[mapping.typeProp] = {
        select: {
          name: match ? match.name : item.type,
        },
      };
    } else if (propDef.type === "status") {
      const options = propDef.status?.options || [];
      const match = options.find(
        (opt: any) => opt.name.toLowerCase() === item.type.toLowerCase()
      );
      if (match) {
        propertiesPayload[mapping.typeProp] = {
          status: {
            name: match.name,
          },
        };
      }
    }
  }

  // 4. Number property (Weight %)
  if (mapping.weightProp && item.weightPercent !== null && item.weightPercent !== undefined) {
    propertiesPayload[mapping.weightProp] = {
      number: item.weightPercent,
    };
  }

  // 5. Course Relation property
  if (mapping.courseRelationProp && matchedCoursePageId) {
    propertiesPayload[mapping.courseRelationProp] = {
      relation: [
        {
          id: matchedCoursePageId,
        },
      ],
    };
  }

  return propertiesPayload;
}

/**
 * Returns simulated Student OS databases and courses for Judge Sandbox Mode.
 */
export function getSandboxStudentOS(): StudentOSDiscoveryResult {
  const tasksDatabase: DiscoveredDatabase = {
    id: "sandbox-tasks-db-001",
    title: "Tasks & Deliverables (Student OS)",
    properties: {
      "Task Name": { id: "p1", type: "title", title: {} },
      "Due Date": { id: "p2", type: "date", date: {} },
      "Type": {
        id: "p3",
        type: "select",
        select: {
          options: [
            { id: "o1", name: "Midterm", color: "red" },
            { id: "o2", name: "Final", color: "purple" },
            { id: "o3", name: "Exam", color: "pink" },
            { id: "o4", name: "Assignment", color: "blue" },
            { id: "o5", name: "Lab", color: "green" },
            { id: "o6", name: "Quiz", color: "yellow" },
            { id: "o7", name: "Project", color: "orange" },
          ],
        },
      },
      "Weight %": { id: "p4", type: "number", number: { format: "percent" } },
      "Course": {
        id: "p5",
        type: "relation",
        relation: { database_id: "sandbox-courses-db-002" },
      },
    },
    url: "https://notion.so/sandbox-student-os/tasks-db",
  };

  const coursesDatabase: DiscoveredDatabase = {
    id: "sandbox-courses-db-002",
    title: "Courses & Subjects (Student OS)",
    properties: {
      "Course Name": { id: "c1", type: "title", title: {} },
      "Code": { id: "c2", type: "rich_text", rich_text: {} },
    },
    url: "https://notion.so/sandbox-student-os/courses-db",
  };

  const existingCourses: DiscoveredCourse[] = [
    {
      id: "course-page-cse-311",
      title: "CSE 311: Database Management Systems",
      code: "CSE 311",
    },
    {
      id: "course-page-eee-204",
      title: "EEE 204: Electronics II",
      code: "EEE 204",
    },
  ];

  const propertyMapping: PropertyMapping = {
    titleProp: "Task Name",
    dateProp: "Due Date",
    typeProp: "Type",
    weightProp: "Weight %",
    courseRelationProp: "Course",
  };

  return {
    tasksDatabase,
    coursesDatabase,
    allDatabases: [tasksDatabase, coursesDatabase],
    existingCourses,
    propertyMapping,
  };
}
