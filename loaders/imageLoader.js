export class ImageLoader {
  static async loadFromFile(file) {
    if (!file.type.startsWith('image/')) {
      throw new Error(`Unsupported image type: ${file.type || file.name}`);
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await this.createImage(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const bitmap = typeof createImageBitmap === 'function'
        ? await createImageBitmap(image)
        : null;

      return {
        bitmap,
        canvas,
        context,
        fileName: file.name,
        height: canvas.height,
        image,
        imageData: context.getImageData(0, 0, canvas.width, canvas.height),
        mimeType: file.type,
        width: canvas.width
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  static createImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image asset.'));
      image.src = src;
    });
  }
}
