import { useEffect } from 'react';
import * as fabric from 'fabric';
import { uploadFile } from '../services/api';

/**
 * Handles pasting images from clipboard into the canvas.
 * Uploads the image to the server (Firebase Storage), then adds it to the canvas.
 */
export default function useImagePasting(fabricCanvas, containerRef, roomId) {
  useEffect(() => {
    if (!fabricCanvas || !roomId || !containerRef.current) return;

    const handlePaste = async (e) => {
      // Ignore if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      let imageFile = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') !== -1) {
          imageFile = items[i].getAsFile();
          break;
        }
      }

      if (!imageFile) return;

      let imgUrl = null;
      try {
        console.log('[Image Paste] Uploading image...', imageFile.name);
        
        // Upload to server (which proxies to Firebase Storage)
        const result = await uploadFile(roomId, imageFile);
        
        if (result.success && result.data.url) {
          imgUrl = result.data.url;
          console.log('[Image Paste] Uploaded successfully!', imgUrl);
        } else {
             throw new Error('Upload returned unsuccessful response');
        }
      } catch (err) {
        console.error('[Image Paste] Failed to upload image:', err);
        alert('Failed to upload image. Please check if Firebase is configured.');
        return;
      }

      if (!imgUrl) return;

      try {
          // Get center of current viewport for placement
          const vpt = fabricCanvas.viewportTransform;
          const center = fabricCanvas.getVpCenter();

          // Load image into Fabric
          const img = await fabric.FabricImage.fromURL(imgUrl, {
            crossOrigin: 'anonymous',
          });

          // Optional: Scale down if image is too large
          const MAX_WIDTH = 500;
          if (img.width > MAX_WIDTH) {
            img.scaleToWidth(MAX_WIDTH);
          }

          // Center it
          img.set({
            left: center.x,
            top: center.y,
            originX: 'center',
            originY: 'center',
          });

          // Add to canvas
          fabricCanvas.add(img);
          fabricCanvas.setActiveObject(img);
          fabricCanvas.requestRenderAll();
      } catch (err) {
          console.error('[Image Paste] Failed to render image onto canvas:', err);
          alert('Image uploaded, but failed to load onto canvas (likely a CORS error). It should work on reload once CORS is configured!');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [fabricCanvas, roomId, containerRef]);
}
