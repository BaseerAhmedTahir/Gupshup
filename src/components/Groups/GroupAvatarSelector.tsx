import React, { useState } from 'react';
import { Check, Users } from 'lucide-react';

interface GroupAvatarSelectorProps {
  selectedAvatar: string;
  onAvatarSelect: (avatarUrl: string) => void;
}

const GroupAvatarSelector: React.FC<GroupAvatarSelectorProps> = ({ selectedAvatar, onAvatarSelect }) => {
  // Professional group avatar collection - team, business, and abstract designs
  const avatars = [
    // Team/Business
    'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/3184293/pexels-photo-3184293.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/3184294/pexels-photo-3184294.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/3184295/pexels-photo-3184295.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/3184296/pexels-photo-3184296.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    
    // Abstract/Geometric
    'https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1323712/pexels-photo-1323712.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1591447/pexels-photo-1591447.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1229042/pexels-photo-1229042.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1591056/pexels-photo-1591056.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1323712/pexels-photo-1323712.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    
    // Technology/Modern
    'https://images.pexels.com/photos/373543/pexels-photo-373543.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/373544/pexels-photo-373544.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/373545/pexels-photo-373545.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/373546/pexels-photo-373546.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/373547/pexels-photo-373547.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/373548/pexels-photo-373548.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    
    // Nature/Landscapes
    'https://images.pexels.com/photos/36717/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/36718/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/36719/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/36720/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/36721/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/36722/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    
    // Colors/Patterns
    'https://images.pexels.com/photos/1591447/pexels-photo-1591447.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1591448/pexels-photo-1591448.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    'https://images.pexels.com/photos/1591449/pexels-photo-1591449.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Choose Group Avatar</h3>
      <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
        {avatars.map((avatar, index) => (
          <button
            key={index}
            onClick={() => onAvatarSelect(avatar)}
            className={`relative w-16 h-16 rounded-full overflow-hidden border-2 transition-all hover:scale-105 ${
              selectedAvatar === avatar
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <img
              src={avatar}
              alt={`Group Avatar ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {selectedAvatar === avatar && (
              <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                <Check className="w-4 h-4 text-blue-600" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default GroupAvatarSelector;