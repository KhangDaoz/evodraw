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

    // Track the last known mouse position on the canvas
    let lastScenePoint = null;
    const onMouseMove = (opt) => {
      lastScenePoint = opt.scenePoint || fabricCanvas.getScenePoint(opt.e);
    };
    fabricCanvas.on('mouse:move', onMouseMove);

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

      const localUrl = URL.createObjectURL(imageFile);
      let img = null;

      try {
        const dropPos = lastScenePoint || fabricCanvas.getVpCenter();
        img = await fabric.FabricImage.fromURL(localUrl);

        const MAX_WIDTH = 500;
        if (img.width > MAX_WIDTH) {
          img.scaleToWidth(MAX_WIDTH);
        }

        img.set({
          left: dropPos.x,
          top: dropPos.y,
          originX: 'center',
          originY: 'center',
        });
        img._evoImage = true;
        img._evoUploading = true; // Prevent history/sync while uploading

        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        fabricCanvas.requestRenderAll();
      } catch (err) {
        console.error('[Image Paste] Failed to render local image preview:', err);
        URL.revokeObjectURL(localUrl);
        return;
      }

      try {
        console.log('[Image Paste] Uploading image...', imageFile.name);
        const result = await uploadFile(roomId, imageFile);
        
        if (result.success && result.data.url) {
          const imgUrl = result.data.url;
          console.log('[Image Paste] Uploaded successfully!', imgUrl);
          
          await img.setSrc(imgUrl, { crossOrigin: 'anonymous' });
          delete img._evoUploading;
          
          fabricCanvas.requestRenderAll();
          // Fire event to trigger history tracking and remote sync now that it has a real URL
          fabricCanvas.fire('object:added', { target: img });
        } else {
             throw new Error('Upload returned unsuccessful response');
        }
      } catch (err) {
        console.error('[Image Paste] Failed to upload image:', err);
        fabricCanvas.remove(img);
        alert('Failed to upload image. Please check if Firebase is configured.');
      } finally {
        URL.revokeObjectURL(localUrl);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      fabricCanvas.off('mouse:move', onMouseMove);
    };
  }, [fabricCanvas, roomId, containerRef]);
}
