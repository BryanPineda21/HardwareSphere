'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload, Save, Eye, Loader2, Camera, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import AuthGuard from '@/components/auth/auth-guard';
import { Toaster, toast } from 'sonner';

// --- Form Data Interface ---
interface ProfileFormData {
  displayName: string;
  username: string;
  bio: string;
  location: string;
  github: string;
  linkedin: string;
  skills: string[];
  avatarFile: File | null;
  bannerFile: File | null;
}

// --- Username Availability State ---
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// --- Skills Input Component ---
const SkillsInput = ({ skills, setSkills }: { skills: string[], setSkills: (skills: string[]) => void }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newSkill = inputValue.trim();
      if (newSkill && !skills.includes(newSkill) && skills.length < 15) {
        setSkills([...skills, newSkill]);
        setInputValue('');
      }
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setSkills(skills.filter(skill => skill !== skillToRemove));
  };

  return (
    <div>
      <Input
        id="skills"
        placeholder="Add a skill and press Enter"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={skills.length >= 15}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {skills.map(skill => (
          <Badge key={skill} variant="secondary" className="flex items-center gap-1">
            {skill}
            <button onClick={() => removeSkill(skill)} className="rounded-full hover:bg-muted-foreground/20">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
};


// --- Main Profile Edit Page ---
export default function ProfileEditPage() {
  const { user, userProfile, revalidateUserProfile } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState<ProfileFormData>({
    displayName: '', username: '', bio: '', location: '', github: '', linkedin: '',
    skills: [], avatarFile: null, bannerFile: null,
  });
  
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  
  // --- Username Availability Check ---
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [debouncedUsername, setDebouncedUsername] = useState('');

  // FIX: Manual debounce implementation using useEffect and setTimeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(formData.username);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [formData.username]);

  const checkUsername = useCallback(async (username: string) => {
    if (!userProfile || username === userProfile.username) {
      setUsernameStatus('idle');
      return;
    }
    if (username.length < 3) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/username-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username }),
      });
      const data = await response.json();
      setUsernameStatus(data.available ? 'available' : 'taken');
    } catch {
      setUsernameStatus('idle'); // Fallback on error
    }
  }, [user, userProfile]);

  useEffect(() => {
    if (debouncedUsername && debouncedUsername !== userProfile?.username) {
      checkUsername(debouncedUsername);
    } else {
       setUsernameStatus('idle');
    }
  }, [debouncedUsername, checkUsername, userProfile?.username]);


  // --- Populate Form on Load ---
  useEffect(() => {
    if (userProfile) {
      setFormData({
        displayName: userProfile.displayName || '',
        username: userProfile.username || '',
        bio: userProfile.bio || '',
        location: userProfile.location || '',
        github: userProfile.github || '',
        linkedin: userProfile.linkedin || '',
        skills: userProfile.skills || [],
        avatarFile: null,
        bannerFile: null,
      });
      setAvatarPreview(userProfile.avatar || null);
      setBannerPreview(userProfile.backgroundImage || null);
    }
  }, [userProfile]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      const setFile = type === 'avatar' ? 'avatarFile' : 'bannerFile';
      const setPreview = type === 'avatar' ? setAvatarPreview : setBannerPreview;
      setFormData(prev => ({ ...prev, [setFile]: file }));
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSkillsChange = (newSkills: string[]) => {
    setFormData(prev => ({ ...prev, skills: newSkills }));
  };

  // --- Single Form Submission Handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus === 'taken') {
      toast.error('Username is already taken. Please choose another.');
      return;
    }
    setIsSaving(true);
    
    const submissionPromise = async () => {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication failed.");

      const data = new FormData();
      data.append('displayName', formData.displayName);
      data.append('username', formData.username);
      data.append('bio', formData.bio);
      data.append('location', formData.location);
      data.append('github', formData.github);
      data.append('linkedin', formData.linkedin);
      data.append('skills', JSON.stringify(formData.skills));

      if (formData.avatarFile) data.append('avatar', formData.avatarFile);
      if (formData.bannerFile) data.append('backgroundImage', formData.bannerFile);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update profile.');
      }
      
      await revalidateUserProfile();
    };

    toast.promise(submissionPromise(), {
      loading: 'Saving your profile...',
      success: () => {
        setTimeout(() => router.push(`/user/${formData.username}`), 1000);
        return 'Profile saved successfully!';
      },
      error: (err) => err.message,
      finally: () => setIsSaving(false)
    });
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900/50">
        <Toaster position="top-center" richColors />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Edit Profile</h1>
            {userProfile?.username && (
              <Button onClick={() => router.push(`/user/${userProfile.username}`)} variant="outline"><Eye className="h-4 w-4 mr-2" /> View Profile</Button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* --- Profile Images Card --- */}
            <Card><CardHeader><CardTitle>Profile Images</CardTitle><CardDescription>Click on an image to upload a new one.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div><Label>Banner Image</Label>
                  <div className="mt-2 h-48 w-full bg-slate-200 dark:bg-slate-800 rounded-lg relative group flex items-center justify-center cursor-pointer" onClick={() => bannerInputRef.current?.click()} style={{ backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Upload className="h-8 w-8 text-white" /></div>
                    <input type="file" ref={bannerInputRef} onChange={(e) => handleFileChange(e, 'banner')} className="hidden" accept="image/jpeg,image/png,image/webp" />
                  </div>
                </div>
                <div className='relative w-32'><Label>Avatar</Label>
                  <div className="relative mt-2 h-32 w-32 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                    <Avatar className="h-full w-full"><AvatarImage src={avatarPreview || undefined} /><AvatarFallback className="text-3xl">{formData.displayName?.[0]}</AvatarFallback></Avatar>
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="h-8 w-8 text-white" /></div>
                  </div>
                  <input type="file" ref={avatarInputRef} onChange={(e) => handleFileChange(e, 'avatar')} className="hidden" accept="image/jpeg,image/png,image/webp" />
                </div>
              </CardContent>
            </Card>

            {/* --- Public Information Card --- */}
            <Card><CardHeader><CardTitle>Public Information</CardTitle><CardDescription>This information will be visible on your profile.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div><Label htmlFor="displayName">Display Name</Label><Input id="displayName" name="displayName" value={formData.displayName} onChange={handleChange} required /></div>
                <div><Label htmlFor="bio">Bio</Label><Textarea id="bio" name="bio" value={formData.bio} onChange={handleChange} placeholder="Tell us about yourself..." rows={4} maxLength={500} /><p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">{formData.bio.length}/500</p></div>
                <div><Label htmlFor="location">Location</Label><Input id="location" name="location" value={formData.location} onChange={handleChange} placeholder="e.g., San Francisco, CA" /></div>
                <div><Label htmlFor="skills">Skills</Label><SkillsInput skills={formData.skills} setSkills={handleSkillsChange} /></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><Label htmlFor="github">GitHub Profile</Label><Input id="github" name="github" value={formData.github} onChange={handleChange} placeholder="github.com/username" /></div>
                  <div><Label htmlFor="linkedin">LinkedIn Profile</Label><Input id="linkedin" name="linkedin" value={formData.linkedin} onChange={handleChange} placeholder="linkedin.com/in/username" /></div>
                </div>
              </CardContent>
            </Card>
            
            {/* --- Account Settings Card --- */}
            <Card><CardHeader><CardTitle>Account Settings</CardTitle><CardDescription>Manage your account details and security.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div><Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <Input id="username" name="username" value={formData.username} onChange={handleChange} required className="pr-10" />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      {usernameStatus === 'checking' && <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />}
                      {usernameStatus === 'available' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                      {usernameStatus === 'taken' && <AlertCircle className="h-5 w-5 text-red-500" />}
                      {usernameStatus === 'invalid' && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                    </div>
                  </div>
                  {usernameStatus === 'taken' && <p className="text-xs text-red-500 mt-1">This username is already taken.</p>}
                  {usernameStatus === 'invalid' && <p className="text-xs text-yellow-500 mt-1">Username must be at least 3 characters.</p>}
                </div>
                <div><Label>Password</Label>
                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start" disabled>Change Password</Button>
                  </TooltipTrigger><TooltipContent><p>Password changes and 2FA coming soon!</p></TooltipContent></Tooltip></TooltipProvider>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end space-x-4 mt-8">
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={isSaving || usernameStatus === 'taken' || usernameStatus === 'checking'}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save All Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}