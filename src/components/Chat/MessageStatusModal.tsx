import React from 'react';
import { X, Check, CheckCheck, Clock, Eye } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

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

interface MessageStatusModalProps {
  message: Message;
  onClose: () => void;
}

const MessageStatusModal: React.FC<MessageStatusModalProps> = ({ message, onClose }) => {
  const getStatusInfo = () => {
    const statuses = [];
    
    // Sent status
    statuses.push({
      icon: <Check className="w-4 h-4 text-gray-500" />,
      label: 'Sent',
      time: message.timestamp,
      description: 'Message sent successfully'
    });

    // Delivered status
    if (message.delivered_at) {
      statuses.push({
        icon: <CheckCheck className="w-4 h-4 text-gray-500" />,
        label: 'Delivered',
        time: message.delivered_at,
        description: 'Message delivered to recipient'
      });
    }

    // Read status
    if (message.read_at) {
      statuses.push({
        icon: <Eye className="w-4 h-4 text-blue-500" />,
        label: 'Read',
        time: message.read_at,
        description: 'Message read by recipient'
      });
    }

    return statuses;
  };

  const statuses = getStatusInfo();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Message Status</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Message:</p>
            <p className="text-sm text-gray-900 break-words">
              {message.deleted_for_everyone ? 'This message was deleted' : message.content}
            </p>
          </div>

          <div className="space-y-3">
            {statuses.map((status, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {status.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(status.time))} ago
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{status.description}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(status.time), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {!message.delivered_at && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">Waiting for delivery</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageStatusModal;