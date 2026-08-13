export type PublishStatus = "draft" | "published" | "archived";
export type ResourceType =
  "worksheet" | "presentation" | "audio" | "teacher_guide";

export interface CourseRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  status: PublishStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LevelRow {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: PublishStatus;
}

export interface LessonRow {
  id: string;
  level_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: PublishStatus;
}

export interface ResourceRow {
  id: string;
  lesson_id: string;
  type: ResourceType;
  title: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: PublishStatus;
}

export interface CourseTree extends CourseRow {
  course_levels: Array<
    LevelRow & {
      lessons: Array<LessonRow & { lesson_resources: ResourceRow[] }>;
    }
  >;
  course_role_access: Array<{
    role_code: "teacher" | "student";
    can_view: boolean;
  }>;
}
