import "server-only";

/**
 * Prompt craft for the image and video agents.
 *
 * WHAT THIS REPLACES. Image agents sent one line — the four templates in the
 * run route, plus whatever the user typed — and video agents sent the user's
 * text verbatim with no direction at all. Generative models are extremely
 * sensitive to camera, lighting and composition language; without it you get
 * the model's default, which is a flatly lit object on grey.
 *
 * A NOTE ON "8K". Neither of these models outputs 8K. Gemini's image model
 * returns a fixed size, and Veo renders 720p or 1080p — those are the only
 * values the API accepts. Writing "8K" into a prompt does not change the pixel
 * count; at best it nudges the model toward detailed, high-fidelity rendering,
 * and at worst it wastes tokens on a word the model treats as noise. So the
 * direction below asks for the things that genuinely change the output —
 * sharpness, micro-detail, lens character, lighting quality — rather than
 * claiming a resolution the API cannot produce. Resolution is set where it is
 * actually settable: as a Veo parameter.
 *
 * Everything here is deliberately specific. "Professional lighting" means
 * nothing to a model; "large softbox at 45 degrees camera-left, white bounce
 * card opposite, soft falloff" produces a different and better picture.
 */

/* --------------------------------------------------------------------------
   Shared vocabulary
   -------------------------------------------------------------------------- */

/** Quality direction that genuinely affects rendering, minus the buzzwords. */
const IMAGE_FINISH =
  "Tack-sharp focus on the subject with true-to-life micro-detail in texture and material. " +
  "Clean, controlled highlights with no blown whites and no crushed blacks. " +
  "Neutral, accurate colour. No text, no watermark, no logo, no border, no collage.";

/** Things these models get wrong unless told not to. */
const IMAGE_AVOID =
  "Avoid: plastic-looking skin, warped or duplicated limbs and fingers, garbled lettering, " +
  "melted product edges, floating shadows that do not match the light, over-sharpened halos, " +
  "and heavy HDR.";

/**
 * How a product should be lit for each kind of business. A silver ring and a
 * plate of biryani need opposite treatments, and the industry is something the
 * workspace already knows.
 */
const INDUSTRY_STYLE: Record<string, string> = {
  jewellery:
    "Macro product photography. Tight controlled reflections on metal, visible facet sparkle in stones, " +
    "gradient dark-to-light backdrop, shallow depth of field so the setting falls away softly.",
  fashion:
    "Editorial apparel photography. Fabric drape and weave clearly readable, natural fall, " +
    "soft directional key light, seamless studio backdrop, styling that flatters the garment rather than the model.",
  footwear:
    "Studio footwear photography. Three-quarter hero angle showing profile and toe, " +
    "material texture and stitching sharp, subtle contact shadow so the shoe sits on the surface.",
  restaurant:
    "Appetising food photography. Warm key light slightly behind the dish for steam and gloss, " +
    "fresh garnish, shallow depth of field, natural props kept sparse and out of focus.",
  grocery:
    "Bright, honest retail photography. Even lighting, saturated but true product colour, " +
    "packaging fully legible and undistorted, uncluttered shelf or surface.",
  furniture:
    "Interior lifestyle photography. Natural window light with long soft shadows, " +
    "room styled but uncluttered, wide-ish lens without distortion, materials and grain visible.",
  jewelry: "",
  electronics:
    "Clean tech product photography. Crisp specular edges, deliberate reflections on glass and metal, " +
    "dark or gradient backdrop, precise geometry with no lens distortion.",
  automotive:
    "Automotive photography. Long lens, low three-quarter angle, continuous reflection running along the body line, " +
    "clean tarmac or studio cyc, sky gradient reflected in the paint.",
  beauty:
    "Beauty photography. Soft even light with a gentle catchlight, true skin tone with pores retained, " +
    "no plastic retouching, clean pastel or neutral backdrop.",
  healthcare:
    "Calm, clinical photography. Bright even lighting, clean neutral surfaces, reassuring and uncluttered. " +
    "No medical claims, no depiction of procedures or patients in distress.",
  realestate:
    "Architectural interior photography. Vertical lines kept perfectly straight, wide lens without bulge, " +
    "windows correctly exposed rather than blown out, warm interior light balanced against daylight.",
  manufacturing:
    "Industrial photography. Hard directional light showing machined surfaces and tolerances, " +
    "clean factory floor, safety equipment correct and present.",
  distribution:
    "Warehouse and logistics photography. Depth down an aisle, even overhead lighting, " +
    "cartons and pallets stacked and labelled realistically.",
};

/** Aspect guidance by intended use, since the model cannot infer it. */
const USE_FRAMING: Record<string, string> = {
  catalogue: "Square 1:1 framing, product centred with even margins, room to crop.",
  social: "Vertical 4:5 framing, subject in the upper two-thirds, clear space for a caption overlay.",
  story: "Vertical 9:16 framing, subject centred with generous headroom for stickers and text.",
  banner: "Wide 16:9 framing, subject offset to one third with clean negative space for a headline.",
};

function styleFor(industry?: string | null): string {
  const key = String(industry || "").toLowerCase().trim();
  return INDUSTRY_STYLE[key] || "Clean commercial product photography with a considered, premium feel.";
}

/* --------------------------------------------------------------------------
   Image
   -------------------------------------------------------------------------- */

export type ImagePromptInput = {
  /** Agent suffix: mockup3d | materialswap | enhance | cleanup | poster | ... */
  kind: string;
  brief: string;
  industry?: string | null;
  hasInputImage?: boolean;
  revision?: string;
  /** catalogue | social | story | banner */
  use?: string;
  /** Business name, when it should appear on the artwork (posters only). */
  business?: string;
};

export function buildImagePrompt(i: ImagePromptInput): string {
  const style = styleFor(i.industry);
  const framing = i.use ? USE_FRAMING[i.use] || "" : "";
  const brief = i.brief.trim() || "the product described by the business";
  const edit = i.hasInputImage;

  const bodies: Record<string, string> = {
    mockup3d:
      `Photorealistic 3D product render of ${brief}. ${style} ` +
      `Three-quarter hero angle, 85mm-equivalent lens, large softbox key at 45 degrees camera-left, ` +
      `white bounce card camera-right to open the shadows, subtle rim light to separate the subject from the background. ` +
      `Seamless graduated backdrop. Grounded contact shadow directly beneath the product.`,

    materialswap:
      `${edit ? "Edit the provided product image. " : ""}Change the material, metal or colour as follows: ${brief}. ` +
      `CRITICAL: keep the shape, proportions, camera angle, framing and background EXACTLY as they are — ` +
      `alter only the surface material, and relight it so reflections and shadows are physically consistent with the new material. ` +
      `${style}`,

    enhance:
      `${edit ? "Restore and enhance the provided photograph. " : ""}${brief} ` +
      `Remove motion blur and noise, recover fine detail, correct white balance and exposure, straighten the horizon. ` +
      `Keep it photographic and believable — do not repaint, restyle or invent detail that is not in the original. ${IMAGE_FINISH}`,

    cleanup:
      `${edit ? "Take the provided product photograph. " : ""}Cut the product out cleanly and place it on a ` +
      `${brief || "pure white"} studio backdrop with a soft realistic contact shadow. ` +
      `Preserve the exact product shape and every edge, including thin and translucent areas. ${style}`,

    poster:
      `Design a promotional poster for ${brief}. ${style} ` +
      `Strong single focal point, deliberate visual hierarchy, generous margins, and a clear area of negative space ` +
      `reserved for a headline and a call to action. Balanced composition that still reads at thumbnail size.` +
      (i.business ? ` The business is called "${i.business}".` : ""),
  };

  const body = bodies[i.kind] || `Produce a high-quality commercial image. ${brief}. ${style}`;

  return [
    body,
    framing,
    IMAGE_FINISH,
    IMAGE_AVOID,
    i.revision ? `Apply this revision, changing nothing else: ${i.revision}` : "",
  ].filter(Boolean).join(" ");
}

/* --------------------------------------------------------------------------
   Video
   -------------------------------------------------------------------------- */

export type VideoPromptInput = {
  brief: string;
  industry?: string | null;
  aspect?: "16:9" | "9:16";
  hasInputImage?: boolean;
};

/**
 * Veo responds to shot language: it wants to be told the camera move, the lens,
 * the light and the pacing. Handed a bare sentence it invents all four, which is
 * why untuned clips look like stock footage.
 */
export function buildVideoPrompt(v: VideoPromptInput): string {
  const style = styleFor(v.industry);
  const vertical = v.aspect === "9:16";
  const brief = v.brief.trim() || "the product";

  return [
    v.hasInputImage
      ? `Animate the provided still into a live-action product shot. Keep the product's shape, colour and branding identical to the still.`
      : `Live-action commercial product film.`,
    `Subject: ${brief}.`,
    style,
    // Camera: one deliberate move, because Veo produces mush when asked for several.
    `Camera: a single slow continuous move — a gentle push-in on a gimbal, or a slow orbit of no more than 30 degrees. ` +
      `Shallow depth of field, cinematic 24fps motion cadence with natural motion blur. No cuts, no whip pans, no zoom punches.`,
    `Lighting: soft key with visible falloff, a rim light separating the subject from the background, and light that moves believably as the camera moves.`,
    vertical
      ? `Framing: vertical 9:16 for mobile. Subject in the upper two-thirds, clean space at the bottom for a caption.`
      : `Framing: horizontal 16:9. Subject on a third, with clean negative space for a headline.`,
    `Colour: a graded commercial look with true product colour — rich but not oversaturated, and no heavy LUT.`,
    `Avoid: on-screen text, captions, subtitles, watermarks, logos, warped or duplicated hands, morphing product edges, and flickering between frames.`,
  ].join(" ");
}

/**
 * Veo's own parameters. Kept beside the prompt because the two decide quality
 * together, and one of them costs money.
 *
 * COST. Veo bills PER SECOND. The model default here is the Fast tier
 * deliberately: a Standard-tier 8-second clip runs about ₹306 against 40 credits
 * of revenue, which is the loss this codebase already took once. 1080p also
 * REQUIRES an 8-second duration per the API, so opting into it raises both the
 * resolution and the bill. It is therefore opt-in through VEO_RESOLUTION rather
 * than a silent default.
 */
export function veoParameters(aspect: "16:9" | "9:16") {
  const want = (process.env.VEO_RESOLUTION || "720p").trim().toLowerCase();
  const resolution = want === "1080p" ? "1080p" : "720p";
  return {
    aspectRatio: aspect,
    personGeneration: "allow_adult",
    resolution,
    // The API rejects 1080p at any other length.
    ...(resolution === "1080p" ? { durationSeconds: "8" } : {}),
  };
}
