'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createUserProfile, getUserProfile } from '@/lib/user-service';
import { UserProfile } from '@/types/user';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // FIX: Added a function to manually re-fetch the user profile.
  // This is essential for updating the UI after a change.
  const revalidateUserProfile = useCallback(async () => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    }
  }, [user]); // Dependency on the user object

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (user) {
        let profile = await getUserProfile(user.uid);
        
        if (!profile) {
          await createUserProfile(
            user.uid, 
            user.email!, 
            user.displayName || ''
          );
          profile = await getUserProfile(user.uid);
        }
        
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signup = async (email: string, password: string, displayName: string) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(user.uid, email, displayName);
    // Revalidate after signup to get the full profile
    await revalidateUserProfile();
    return user;
  };

  const login = async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    // Revalidate on login
    await revalidateUserProfile();
    return user;
  };

  const logout = async () => {
    await signOut(auth);
  };

  return {
    user,
    userProfile,
    loading,
    signup,
    login,
    logout,
    // FIX: Export the new function so components can use it.
    revalidateUserProfile 
  };
};