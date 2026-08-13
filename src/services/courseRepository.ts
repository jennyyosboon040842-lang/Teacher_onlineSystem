import { requireSupabase, supabase } from "../lib/supabase";
import type { CourseTree, ResourceType } from "../lib/database.types";

export const courseRepository = {
  async list(): Promise<CourseTree[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("courses")
      .select(
        `
        *,
        course_role_access(role_code, can_view),
        course_levels(*, lessons(*, lesson_resources(*)))
      `,
      )
      .is("archived_at", null)
      .order("sort_order")
      .order("sort_order", { referencedTable: "course_levels" });
    if (error) throw error;
    return (data ?? []) as CourseTree[];
  },

  async createCourse(input: { name: string; description: string }) {
    const client = requireSupabase();
    const code = `COURSE-${Date.now()}`;
    const { data, error } = await client
      .from("courses")
      .insert({
        code,
        name: input.name,
        description: input.description || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  },

  async createLevel(
    courseId: string,
    input: { name: string; description: string; sortOrder: number },
  ) {
    const client = requireSupabase();
    const { data, error } = await client
      .from("course_levels")
      .insert({
        course_id: courseId,
        name: input.name,
        description: input.description || null,
        sort_order: input.sortOrder,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  },

  async createLesson(
    levelId: string,
    input: { title: string; description: string; sortOrder: number },
  ) {
    const client = requireSupabase();
    const { data, error } = await client
      .from("lessons")
      .insert({
        level_id: levelId,
        title: input.title,
        description: input.description || null,
        sort_order: input.sortOrder,
        status: "published",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  },

  async setAccess(
    courseId: string,
    role: "teacher" | "student",
    canView: boolean,
  ) {
    const client = requireSupabase();
    const { error } = await client
      .from("course_role_access")
      .upsert(
        { course_id: courseId, role_code: role, can_view: canView },
        { onConflict: "course_id,role_code" },
      );
    if (error) throw error;
  },

  async setPublished(courseId: string, published: boolean) {
    const client = requireSupabase();
    const { error } = await client
      .from("courses")
      .update({
        status: published ? "published" : "draft",
        published_at: published ? new Date().toISOString() : null,
      })
      .eq("id", courseId);
    if (error) throw error;
  },

  async listTeacherAssignments(courseId: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from("teacher_course_assignments")
      .select("teacher_id")
      .eq("course_id", courseId)
      .is("ended_at", null);
    if (error) throw error;
    return (data ?? []).map((row) => row.teacher_id as string);
  },

  async assignTeacher(courseId: string, teacherId: string) {
    const client = requireSupabase();
    const { error } = await client
      .from("teacher_course_assignments")
      .upsert(
        { course_id: courseId, teacher_id: teacherId, ended_at: null },
        { onConflict: "course_id,teacher_id" },
      );
    if (error) throw error;
  },

  async unassignTeacher(courseId: string, teacherId: string) {
    const client = requireSupabase();
    const { error } = await client
      .from("teacher_course_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("course_id", courseId)
      .eq("teacher_id", teacherId)
      .is("ended_at", null);
    if (error) throw error;
  },

  async uploadResource(input: {
    courseId: string;
    levelId: string;
    lessonId: string;
    type: ResourceType;
    file: File;
  }) {
    const client = requireSupabase();
    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session)
      throw new Error("กรุณาเข้าสู่ระบบใหม่ก่อนอัปโหลดไฟล์");

    if (input.file.size <= 0)
      throw new Error("ไฟล์ว่างหรือไม่สามารถอ่านไฟล์ได้");
    if (input.file.size > 200 * 1024 * 1024)
      throw new Error("ไฟล์มีขนาดเกิน 200 MB");

    const extension = input.file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeByExtension: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/x-m4a",
    };
    const contentType =
      mimeByExtension[extension] ??
      (input.file.type || "application/octet-stream");
    const resourceId = crypto.randomUUID();
    const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${input.courseId}/${input.levelId}/${input.lessonId}/${resourceId}/${safeName}`;
    const { error: uploadError } = await client.storage
      .from("lesson-resources")
      .upload(path, input.file, {
        upsert: false,
        contentType,
        cacheControl: "0",
      });
    if (uploadError) throw uploadError;

    const { data, error } = await client
      .from("lesson_resources")
      .insert({
        id: resourceId,
        lesson_id: input.lessonId,
        type: input.type,
        title: input.file.name,
        storage_path: path,
        original_filename: input.file.name,
        mime_type: contentType,
        size_bytes: input.file.size,
        status: "published",
      })
      .select("id")
      .single();

    if (error) {
      await client.storage.from("lesson-resources").remove([path]);
      throw error;
    }
    return { id: data.id as string, path };
  },

  async createResourcePreview(resourceId: string) {
    const client = requireSupabase();
    const { data: resource, error: resourceError } = await client
      .from("lesson_resources")
      .select("id, type, title, storage_path, mime_type, original_filename")
      .eq("id", resourceId)
      .single();
    if (resourceError)
      throw new Error(`อ่านข้อมูลไฟล์ไม่สำเร็จ: ${resourceError.message}`);

    const { data, error } = await client.storage
      .from("lesson-resources")
      .createSignedUrl(resource.storage_path, 120);
    if (error) {
      const { data: health } = await client
        .from("lesson_resource_storage_health")
        .select("object_exists")
        .eq("resource_id", resourceId)
        .maybeSingle();
      if (health && health.object_exists === false) {
        throw new Error(
          "ไม่พบไฟล์จริงใน Storage กรุณาลบรายการนี้แล้วอัปโหลดไฟล์ใหม่",
        );
      }
      throw new Error(`สร้างลิงก์เปิดไฟล์ไม่สำเร็จ: ${error.message}`);
    }
    return {
      url: data.signedUrl,
      type: resource.type as
        "worksheet" | "presentation" | "audio" | "teacher_guide",
      title: resource.title as string,
      mimeType: resource.mime_type as string,
      filename: resource.original_filename as string,
      expiresInSeconds: 120,
    };
  },
};
