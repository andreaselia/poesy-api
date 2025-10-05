import { Hono } from "hono";
import { cors } from "hono/cors";
import OpenAI from "openai";
import { monotonicFactory } from "ulid";

const app = new Hono<{ Bindings: CloudflareBindings }>();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use("/*", cors());

app.get("/", (c) => {
  return c.text("Hello Poesy!");
});

app.post("/generate", async (c) => {
  try {
    const body = await c.req.parseBody();
    const imageFile = body["image"];

    if (!imageFile) {
      return c.json({ error: "No image file provided" }, 400);
    }

    if (!(imageFile instanceof File)) {
      return c.json({ error: "Invalid image file format" }, 400);
    }

    const maxSize = 10 * 1024 * 1024; // 10MB

    if (imageFile.size > maxSize) {
      return c.json(
        { error: "Image file too large. Maximum size is 10MB" },
        400,
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(imageFile.type)) {
      return c.json(
        {
          error:
            "Unsupported image format. Allowed formats: JPEG, PNG, GIF, WebP",
        },
        400,
      );
    }

    const ulidMonotonic = monotonicFactory();
    const extension = imageFile.name.split(".").pop() || "jpg";
    const filename = `${ulidMonotonic}.${extension}`;

    const arrayBuffer = await imageFile.arrayBuffer();

    try {
      await c.env.POESY_IMAGES.put(filename, arrayBuffer, {
        httpMetadata: {
          contentType: imageFile.type,
        },
      });
    } catch (error) {
      console.error("Failed to upload to R2:", error);

      return c.json(
        {
          error: "Failed to upload image",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }

    const bucketPublicUrl = process.env.R2_PUBLIC_URL;
    const imageUrl = `${bucketPublicUrl}/${filename}`;

    let response;

    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Write a short, beautiful poem based on this image. Capture the mood, atmosphere, and essence of what you see.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      });
    } catch (error) {
      console.error("OpenAI API error:", error);

      return c.json(
        {
          error: "Failed to generate poem",
          details: error instanceof Error ? error.message : "OpenAI API error",
        },
        500,
      );
    }

    const poem = response.choices[0]?.message?.content || "";

    if (!poem) {
      return c.json(
        {
          error: "Failed to generate poem",
          details: "No content returned from OpenAI",
        },
        500,
      );
    }

    return c.json({
      success: true,
      poem,
      imageUrl,
    });
  } catch (error) {
    console.error("Error generating poem:", error);

    return c.json(
      {
        error: "Failed to generate poem",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
