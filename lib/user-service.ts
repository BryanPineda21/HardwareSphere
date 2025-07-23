import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile } from '@/types/user';

export const createUserProfile = async (
  uid: string, 
  email: string, 
  displayName: string
): Promise<void> => {
  // Generate username from display name or email
  const username = generateUsername(displayName || email);
  
  const userProfile: Partial<UserProfile> = {
    uid,
    email,
    displayName: displayName || email.split('@')[0],
    username,
    bio: '',
    stats: {
      totalProjects: 0,
      totalViews: 0,
      totalLikes: 0
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, 'users', uid), userProfile);
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  return userDoc.exists() ? userDoc.data() as UserProfile : null;
};

export const updateUserProfile = async (
  uid: string, 
  updates: Partial<UserProfile>
): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp()
  });
};

// Helper function to generate unique username
const generateUsername = (name: string): string => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 15);
  
  const randomSuffix = Math.floor(Math.random() * 1000);
  return `${base}${randomSuffix}`;
};