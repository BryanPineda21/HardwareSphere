// components/ui/share-button.tsx
"use client";

import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Share2, 
  Copy, 
  Check,
  Facebook,
  Twitter,
  Linkedin,
  Mail
} from "lucide-react";

interface ShareButtonProps {
  title: string;
  description?: string;
  url?: string;
  authorName?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "ghost";
}

export default function ShareButton({ 
  title, 
  description, 
  url, 
  authorName,
  size = "sm",
  variant = "outline"
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareTitle = title;
  const shareText = description 
    ? `${description.slice(0, 100)}...` 
    : `Check out this amazing project: ${title}${authorName ? ` by ${authorName}` : ''}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleShare = (platform: string) => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(shareTitle);
    const encodedText = encodeURIComponent(shareText);

    let shareUrlPlatform = '';

    switch (platform) {
      case 'facebook':
        shareUrlPlatform = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'twitter':
        shareUrlPlatform = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'linkedin':
        shareUrlPlatform = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'email':
        shareUrlPlatform = `mailto:?subject=${encodedTitle}&body=${encodedText}%0A%0A${encodedUrl}`;
        break;
      default:
        return;
    }

    if (platform === 'email') {
      window.location.href = shareUrlPlatform;
    } else {
      window.open(shareUrlPlatform, '_blank', 'width=600,height=400');
    }
    
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
            Share this project
          </div>
          
          {/* Social Media Options */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-3 h-10"
              onClick={() => handleShare('facebook')}
            >
              <Facebook className="h-4 w-4 text-blue-600" />
              <span className="text-sm">Facebook</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-3 h-10"
              onClick={() => handleShare('twitter')}
            >
              <Twitter className="h-4 w-4 text-sky-500" />
              <span className="text-sm">Twitter</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-3 h-10"
              onClick={() => handleShare('linkedin')}
            >
              <Linkedin className="h-4 w-4 text-blue-700" />
              <span className="text-sm">LinkedIn</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-3 h-10"
              onClick={() => handleShare('email')}
            >
              <Mail className="h-4 w-4 text-slate-600" />
              <span className="text-sm">Email</span>
            </Button>
          </div>

          <Separator className="my-3" />

          {/* Copy Link */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 h-10"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">Link copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="text-sm">Copy link</span>
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}