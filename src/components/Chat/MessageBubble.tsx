import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, CheckCheck, Download, Eye, Trash2, MoreVertical, Info, FileText, Image as ImageIcon, Video, Archive } from 'lucide-react';
import { useState } from 'react';
import MessageStatusModal from './MessageStatusModal';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  read: boolean;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  delivered_at?: string;
  read_at?: string;
  deleted_for_everyone?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isOwn, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canDeleteForEveryone = () => {
    if (!isOwn) return false;
    const messageTime = new Date(message.timestamp);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    return messageTime > twoMinutesAgo;
  };

  const getMessageStatus = () => {
    if (!isOwn) return null;
    
    if (message.read_at) {
      return <CheckCheck className="w-3 h-3 text-blue-400" />;
    } else if (message.delivered_at) {
      return <CheckCheck className="w-3 h-3" />;
    } else {
      return <Check className="w-3 h-3" />;
    }
  };

  const handleDelete = (deleteForEveryone: boolean) => {
    if (onDelete) {
      onDelete(message.id, deleteForEveryone);
    }
    setShowMenu(false);
  };

  const getFileIcon = (fileType: string) => {
    if (fileType?.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-600" />;
    if (fileType?.startsWith('video/')) return <Video className="w-5 h-5 text-purple-600" />;
    if (fileType?.includes('zip') || fileType?.includes('rar') || fileType?.includes('7z') || fileType?.includes('tar') || fileType?.includes('gzip')) {
      return <Archive className="w-5 h-5 text-orange-600" />;
    }
    return <FileText className="w-5 h-5 text-gray-600" />;
  };

  const renderContent = () => {
    if (message.deleted_for_everyone) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 italic">
          <Trash2 className="w-4 h-4" />
          <span className="text-sm">This message was deleted</span>
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
            {getFileIcon(message.file_name?.split('.').pop() || '')}
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
      <p className="text-sm break-words">{message.content}</p>
    );
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} message-bubble group relative`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
          isOwn
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-900 border border-gray-200'
        }`}
      >
        {/* Message menu */}
        {!message.deleted_for_everyone && (
          <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 bg-gray-100 hover:bg-gray-200 rounded-full shadow-sm"
              >
                <MoreVertical className="w-3 h-3 text-gray-600" />
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[150px]">
                  {isOwn && (
                    <button
                      onClick={() => {
                        setShowStatusModal(true);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <Info className="w-4 h-4 mr-2" />
                      Message Status
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(false)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {isOwn ? 'Delete for me' : 'Delete for me'}
                  </button>
                  {isOwn && canDeleteForEveryone() && (
                    <button
                      onClick={() => handleDelete(true)}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete for everyone
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {renderContent()}
        
        <div className={`flex items-center justify-end space-x-1 mt-1 ${
          isOwn ? 'text-blue-200' : 'text-gray-500'
        }`}>
          <span className="text-xs">
            {formatDistanceToNow(new Date(message.timestamp))} ago
          </span>
          {getMessageStatus()}
        </div>
      </div>
      
      {showStatusModal && (
        <MessageStatusModal
          message={message}
          onClose={() => setShowStatusModal(false)}
        />
      )}
    </div>
  );
};

export default MessageBubble;