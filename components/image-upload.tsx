"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { ImageGallery } from "@/components/image-gallery";

interface ImageUploadProps {
  onImageUploaded: (imageUrl: string) => void;
  currentImageUrl?: string;
  label?: string;
}

export function ImageUpload({ onImageUploaded, currentImageUrl, label = "Token Image" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 10MB",
        variant: "destructive"
      });
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Arweave
    await uploadToArweave(file);
  };

  const uploadToArweave = async (file: File) => {
    try {
      setUploading(true);
      
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      // Upload via our API route
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      if (data.success && data.url) {
        onImageUploaded(data.url);
        toast({
          title: "Image Uploaded! 🎉",
          description: "Your image has been permanently stored on Arweave",
          duration: 5000
        });
      } else {
        throw new Error(data.error || 'Upload failed');
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload image",
        variant: "destructive"
      });
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeImage = () => {
    setPreview(null);
    onImageUploaded('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Label>{label}</Label>
      
      {/* Hidden file input */}
      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Upload Area */}
      {!preview ? (
        <div className="space-y-4">
          <div 
            onClick={triggerFileSelect}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
          >
            <div className="space-y-2">
              <div className="text-4xl">📸</div>
              <h3 className="font-medium">Upload Token Image</h3>
              <p className="text-sm text-gray-500">
                Click to select an image from your device
                <br />
                Recommended: 200x200px, max 10MB
              </p>
              <p className="text-xs text-blue-600">
                🔗 Stored permanently on blockchain
              </p>
            </div>
          </div>
          
          {/* Template Gallery */}
          <ImageGallery onImageSelect={(imageUrl) => {
            setPreview(imageUrl);
            onImageUploaded(imageUrl);
          }} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Preview */}
          <div className="flex items-start gap-4 p-4 border rounded-lg">
            <img 
              src={preview} 
              alt="Token preview" 
              className="w-20 h-20 rounded-lg object-cover border"
            />
            <div className="flex-1">
              <h4 className="font-medium">Image Preview</h4>
              <p className="text-sm text-gray-500">
                {uploading 
                  ? "Uploading to Arweave..." 
                  : "Ready to use in your token"
                }
              </p>
              {uploading && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <LoadingSpinner />
                    <span className="text-xs">Storing on blockchain...</span>
                  </div>
                </div>
              )}
            </div>
            {!uploading && (
              <Button
                variant="outline"
                size="sm"
                onClick={removeImage}
              >
                Remove
              </Button>
            )}
          </div>

          {/* Upload different image button */}
          {!uploading && (
            <Button
              variant="outline"
              onClick={triggerFileSelect}
              className="w-full"
            >
              Upload Different Image
            </Button>
          )}
        </div>
      )}

      {/* Upload status */}
      {uploading && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            🚀 <strong>Uploading to Arweave...</strong> This may take 30-60 seconds. Your image will be permanently stored on the blockchain.
          </p>
        </div>
      )}
    </div>
  );
}