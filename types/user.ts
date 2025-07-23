// types/user.ts
import { Timestamp, FieldValue } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username: string;              // Unique username for URLs
  bio?: string;
  avatar?: string;               // Profile picture URL
  backgroundImage?: string;      // Banner image URL
  github?: string;               // GitHub username
  linkedin?: string;             // LinkedIn slug
  location?: string;             // User's location
  skills?: string[];             // Array of user's skills
  
  // Analytics
  stats?: {
    totalProjects: number;
    totalViews: number;
    totalLikes: number;
  };
  
  // Metadata
  // Allow FieldValue when setting (with serverTimestamp())
  // Allow Timestamp when reading from Firestore
  createdAt: Timestamp | FieldValue; 
  updatedAt: Timestamp | FieldValue;
  lastUsernameChange?: Timestamp | FieldValue;
}

