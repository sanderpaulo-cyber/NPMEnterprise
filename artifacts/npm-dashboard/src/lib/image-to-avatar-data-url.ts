/**
 * Converte ficheiro de imagem num data URL JPEG (~128px) para gravar em avatar_image_url.
 */
export async function imageFileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Seleccione um ficheiro de imagem.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Imagem demasiado grande (máx. 5 MB).");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = objectUrl;
    });

    const max = 128;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w < 1 || h < 1) {
      throw new Error("Imagem inválida.");
    }
    const scale = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas não disponível.");
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
