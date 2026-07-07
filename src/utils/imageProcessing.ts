import { pipeline, env } from '@huggingface/transformers';
import imageCompression from 'browser-image-compression';
// The published types point to the Node build (Buffer-based static functions),
// but at runtime the browser bundle exports a class constructor. Cast to any
// so TS accepts `new ColorThief()` with HTMLImageElement inputs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ColorThiefImport from 'colorthief';
const ColorThief = ColorThiefImport as any;

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = false;

const MAX_IMAGE_DIMENSION = 1024;

interface ImageProcessingOptions {
  compress?: boolean;
  removeBackground?: boolean;
  extractColors?: boolean;
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
}

interface ProcessedImageResult {
  originalBlob: Blob;
  compressedBlob?: Blob;
  backgroundRemovedBlob?: Blob;
  colors?: string[];
  dominantColor?: string;
  metadata: {
    originalSize: number;
    compressedSize?: number;
    compressionRatio?: number;
    dimensions: { width: number; height: number };
  };
}

class ImageProcessor {
  private static segmenter: any = null;
  private static colorThief = new ColorThief();

  static async initializeBackgroundRemoval() {
    if (!this.segmenter) {
      console.log('Initializing background removal model...');
      this.segmenter = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
        device: 'webgpu',
      });
    }
    return this.segmenter;
  }

  static resizeImageIfNeeded(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
    let width = image.naturalWidth;
    let height = image.naturalHeight;

    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      if (width > height) {
        height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
        width = MAX_IMAGE_DIMENSION;
      } else {
        width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
        height = MAX_IMAGE_DIMENSION;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(image, 0, 0, width, height);
      return true;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0);
    return false;
  }

  static async compressImage(file: File, options: { maxSizeMB: number; maxWidthOrHeight: number }): Promise<Blob> {
    const compressionOptions = {
      maxSizeMB: options.maxSizeMB,
      maxWidthOrHeight: options.maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/jpeg',
      quality: 0.8,
    };

    return await imageCompression(file, compressionOptions);
  }

  static async removeBackground(imageElement: HTMLImageElement): Promise<Blob> {
    try {
      const segmenter = await this.initializeBackgroundRemoval();
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Could not get canvas context');
      
      const wasResized = this.resizeImageIfNeeded(canvas, ctx, imageElement);
      console.log(`Image ${wasResized ? 'was' : 'was not'} resized. Final dimensions: ${canvas.width}x${canvas.height}`);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      console.log('Processing with segmentation model...');
      
      const result = await segmenter(imageData);
      
      if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
        throw new Error('Invalid segmentation result');
      }
      
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = canvas.width;
      outputCanvas.height = canvas.height;
      const outputCtx = outputCanvas.getContext('2d');
      
      if (!outputCtx) throw new Error('Could not get output canvas context');
      
      outputCtx.drawImage(canvas, 0, 0);
      
      const outputImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
      const data = outputImageData.data;
      
      // Apply inverted mask to alpha channel
      for (let i = 0; i < result[0].mask.data.length; i++) {
        const alpha = Math.round((1 - result[0].mask.data[i]) * 255);
        data[i * 4 + 3] = alpha;
      }
      
      outputCtx.putImageData(outputImageData, 0, 0);
      
      return new Promise((resolve, reject) => {
        outputCanvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          'image/png',
          1.0
        );
      });
    } catch (error) {
      console.error('Error removing background:', error);
      throw error;
    }
  }

  static async extractColors(imageElement: HTMLImageElement): Promise<{ colors: string[]; dominantColor: string }> {
    try {
      // Get color palette
      const colorPalette = this.colorThief.getPalette(imageElement, 8);
      const dominantColorRgb = this.colorThief.getColor(imageElement);
      
      // Convert RGB arrays to hex strings
      const colors = colorPalette.map((rgb: number[]) => 
        '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('')
      );
      
      const dominantColor = '#' + dominantColorRgb.map((x: number) => 
        x.toString(16).padStart(2, '0')
      ).join('');

      return { colors, dominantColor };
    } catch (error) {
      console.error('Error extracting colors:', error);
      return { colors: [], dominantColor: '#000000' };
    }
  }

  static loadImage(file: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Enable CORS for color extraction
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  static async processImage(file: File, options: ImageProcessingOptions = {}): Promise<ProcessedImageResult> {
    const {
      compress = true,
      removeBackground = false,
      extractColors = true,
      maxSizeMB = 1,
      maxWidthOrHeight = 1920
    } = options;

    const originalSize = file.size;
    let compressedBlob: Blob | undefined;
    let backgroundRemovedBlob: Blob | undefined;
    let colors: string[] = [];
    let dominantColor = '#000000';

    // Load image for processing
    const imageElement = await this.loadImage(file);
    const dimensions = {
      width: imageElement.naturalWidth,
      height: imageElement.naturalHeight
    };

    // Compress image if requested
    if (compress) {
      compressedBlob = await this.compressImage(file, { maxSizeMB, maxWidthOrHeight });
    }

    // Remove background if requested
    if (removeBackground) {
      backgroundRemovedBlob = await this.removeBackground(imageElement);
    }

    // Extract colors if requested
    if (extractColors) {
      const colorData = await this.extractColors(imageElement);
      colors = colorData.colors;
      dominantColor = colorData.dominantColor;
    }

    // Calculate compression ratio
    const compressionRatio = compressedBlob ? originalSize / compressedBlob.size : undefined;

    // Clean up
    URL.revokeObjectURL(imageElement.src);

    return {
      originalBlob: file,
      compressedBlob,
      backgroundRemovedBlob,
      colors,
      dominantColor,
      metadata: {
        originalSize,
        compressedSize: compressedBlob?.size,
        compressionRatio,
        dimensions
      }
    };
  }
}

export { ImageProcessor };
export type { ImageProcessingOptions, ProcessedImageResult };