import type { AdminData } from "../../_lib/admin-auth";
import { canPublishPosts } from "../../_lib/permissions";

export const onRequestGet: PagesFunction<Env, string, AdminData> = async (context) => {
  return Response.json(
    {
      user: context.data.user,
      permissions: {
        publish: canPublishPosts(context.request, context.data.user, context.env),
        upload: false,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
};
