import React from 'react';
import { FaFacebook, FaInstagram, FaLinkedin, FaGoogle } from 'react-icons/fa';
import './PlatformSelector.css';

const platforms = [
  { id: 'facebook', name: 'Facebook', icon: FaFacebook, color: '#1877F2' },
  { id: 'instagram', name: 'Instagram', icon: FaInstagram, color: '#E4405F' },
  { id: 'linkedin', name: 'LinkedIn', icon: FaLinkedin, color: '#0A66C2' },
  { id: 'google', name: 'Google Posts', icon: FaGoogle, color: '#EA4335' }
];

export default function PlatformSelector({ selectedPlatform, onSelectPlatform }) {
  return (
    <div className="platform-selector animate-fade-in" style={{ animationDelay: '0.1s' }}>
      {platforms.map((platform) => {
        const Icon = platform.icon;
        const isSelected = selectedPlatform === platform.id;
        
        return (
          <button
            key={platform.id}
            className={`platform-btn glass-panel ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectPlatform(platform.id)}
            style={{ '--hover-color': platform.color }}
          >
            <Icon className="platform-icon" size={24} />
            <span className="platform-name">{platform.name}</span>
            {isSelected && <div className="active-indicator" style={{ backgroundColor: platform.color }}></div>}
          </button>
        );
      })}
    </div>
  );
}
