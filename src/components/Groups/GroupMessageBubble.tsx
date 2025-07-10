import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, MoreVertical, FileText, Image as ImageIcon, Video, Archive, Eye, User, Check, CheckCheck } from 'lucide-react';
import UserProfileModal from '../Profile/UserProfileModal';

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  mentioned_users: string[];
  deleted_for_users: string[];
  delivered_at?: string;
  read_at?: string;
  sender: {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
  };
}

interface GroupMember {
  id: string;
  user_id: string;
  role: 'admin' | 'member';
  user: {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
  };
}

interface GroupMessageBubbleProps {
  message: GroupMessage;
  isOwn: boolean;
  members: GroupMember[];
  onDelete?: (messageId: string, deleteForEveryone?: boolean) => void;
}

const GroupMessageBubble: React.FC<GroupMessageBubbleProps> = ({ 
  message, 
  isOwn, 
  members, 
  onDelete 
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);

  const canDeleteForEveryone = () => {
    if (!isOwn || message.sender_id === '00000000-0000-0000-0000-000000000000') return false;
    const messageTime = new Date(message.timestamp);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    return messageTime > twoMinutesAgo;
  };

  const getMessageStatus = () => {
    if (!isOwn || message.sender_id === '00000000-0000-0000-0000-000000000000') return null;
    
    if (message.read_at) {
      return <CheckCheck className="w-3 h-3 text-blue-500" />;
    } else if (message.delivered_at) {
      return <CheckCheck className="w-3 h-3 text-gray-400" />;
    } else {
      return <Check className="w-3 h-3 text-gray-400" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <ImageIcon className="w-5 h-5 text-blue-600" />;
    }
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(ext || '')) {
      return <Video className="w-5 h-5 text-purple-600" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <Archive className="w-5 h-5 text-orange-600" />;
    }
    return <FileText className="w-5 h-5 text-gray-600" />;
  };

  const renderMentions = (content: string) => {
    const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
    const parts = content.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        // This is a mention
        const mentionedMember = members.find(member => 
          member.user.display_name.toLowerCase() === part.toLowerCase() ||
          member.user.email.toLowerCase().startsWith(part.toLowerCase()) ||
          member.user.email.split('@')[0].toLowerCase() === part.toLowerCase()
        );
        
        if (mentionedMember) {
          return (
            <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md font-medium">
              @{mentionedMember.user.display_name || mentionedMember.user.email.split('@')[0]}
            </span>
          );
        }
        return (
          <span key={index} className="text-blue-600 font-medium">
            @{part}
          </span>
        );
      }
      return part;
    });
  };

  const renderContent = () => {
    // Handle system messages
    if (message.sender_id === '00000000-0000-0000-0000-000000000000') {
      return (
        <div className="flex items-center justify-center">
          <div className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">
            {message.content}
          </div>
        </div>
      );
    }

    if (message.type === 'image' && message.file_url) {
      return (
        <div className="max-w-xs">
          <img
            src={message.file_url}
            alt={message.content}
            className="rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => window.open(message.file_url, '_blank')}
          />
          <p className="text-xs text-gray-600 mt-1">{message.content}</p>
        </div>
      );
    }

    if (message.type === 'file' && message.file_url) {
      return (
        <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg max-w-xs">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            {getFileIcon(message.file_name || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {message.file_name || message.content}
            </p>
            <p className="text-xs text-gray-500">
              {message.file_size && formatFileSize(message.file_size)}
            </p>
          </div>
          <button
            onClick={() => window.open(message.file_url, '_blank')}
            className="text-blue-600 hover:text-blue-700"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <p className="text-sm break-words">
        {renderMentions(message.content)}
      </p>
    );
  };

  // Handle system messages differently
  if (message.sender_id === '00000000-0000-0000-0000-000000000000') {
    return (
      <div className="flex justify-center my-2">
        {renderContent()}
      </div>
    );
  }
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} message-bubble group relative`}>
      <div className="flex items-start space-x-2 max-w-xs lg:max-w-md">
        {!isOwn && (
          <div 
            className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-300"
            onClick={() => setShowUserProfile(true)}
          >
            {message.sender.avatar_url ? (
              <img
                src={message.sender.avatar_url}
                alt={message.sender.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold text-gray-600">
                {message.sender.email.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        )}
        
        <div
          className={`px-4 py-2 rounded-2xl ${
            isOwn
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-900 border border-gray-200'
          }`}
        >
          {/* Message menu */}
          <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 bg-gray-100 hover:bg-gray-200 rounded-full shadow-sm"
              >
                <MoreVertical className="w-3 h-3 text-gray-600" />
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                  {canDeleteForEveryone() && (
                    <button
                      onClick={() => {
                        if (onDelete) onDelete(message.id, true);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete for everyone
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (onDelete) onDelete(message.id, false);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete for me
                  </button>
                </div>
              )}
            </div>
          </div>

          {!isOwn && (
            <p 
              className="text-xs font-medium mb-1 opacity-75 cursor-pointer hover:opacity-100"
              onClick={() => setShowUserProfile(true)}
            >
              {message.sender.display_name || message.sender.email}
            </p>
          )}
          
          {renderContent()}
          
          <div className={`flex items-center justify-end mt-1 ${
            isOwn ? 'text-blue-200' : 'text-gray-500'
          }`}>
            <div className="flex items-center space-x-1">
              {getMessageStatus()}
            <span className="text-xs">
              {formatDistanceToNow(new Date(message.timestamp))} ago
            </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* User Profile Modal */}
      {showUserProfile && (
        <UserProfileModal
          userId={message.sender_id}
          onClose={() => setShowUserProfile(false)}
          onStartChat={() => {}} // In group context
        />
      )}
    </div>
  );
};

export default GroupMessageBubble;