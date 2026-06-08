import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from 'lucide-react';
import { FaFacebook, FaInstagram, FaLinkedin, FaGoogle } from 'react-icons/fa';

import './CalendarView.css';

const PLATFORM_ICONS = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  linkedin: FaLinkedin,
  google: FaGoogle
};

const PLATFORM_COLORS = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  google: '#EA4335'
};



export default function CalendarView({ cards = [], onEditCard, onAddCard }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // First day of the selected month
  const firstDayOfMonth = new Date(year, month, 1);
  // Get starting day index (Monday = 0, Sunday = 6)
  let startDay = firstDayOfMonth.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  // Days in current, previous and next months
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarCells = [];

  // Previous month's padding cells
  for (let i = startDay - 1; i >= 0; i--) {
    calendarCells.push({
      day: daysInPrevMonth - i,
      isCurrentMonth: false,
      date: new Date(year, month - 1, daysInPrevMonth - i)
    });
  }

  // Current month's cells
  for (let i = 1; i <= daysInMonth; i++) {
    calendarCells.push({
      day: i,
      isCurrentMonth: true,
      date: new Date(year, month, i)
    });
  }

  // Next month's padding cells to complete a full grid (multiples of 7)
  const totalCellsNeeded = calendarCells.length <= 35 ? 35 : 42;
  const paddingDays = totalCellsNeeded - calendarCells.length;
  for (let i = 1; i <= paddingDays; i++) {
    calendarCells.push({
      day: i,
      isCurrentMonth: false,
      date: new Date(year, month + 1, i)
    });
  }

  // Group cells into rows of 7 (weeks)
  const weeks = [];
  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7));
  }

  // Fetch cards scheduled on a specific cell date
  const getCardsForDate = (cellDate) => {
    const cellStr = cellDate.toDateString();
    return cards.filter(card => {
      if (!card.scheduledAt) return false;
      const cardDate = new Date(card.scheduledAt);
      return cardDate.toDateString() === cellStr;
    });
  };

  const handleQuickAdd = (e, cellDate) => {
    e.stopPropagation();
    const scheduled = new Date(cellDate);
    scheduled.setHours(10, 0, 0, 0); // Default to 10:00 AM

    onAddCard({
      scheduledAt: scheduled.toISOString(),
      status: 'draft'
    });
  };

  return (
    <div className="calendar-view-container glass-panel animate-fade-in">
      <div className="calendar-header">
        <div className="calendar-title-area">
          <CalendarIcon size={22} className="calendar-title-icon" />
          <h2>{monthNames[month]} {year}</h2>
        </div>
        
        <div className="calendar-nav-buttons">
          <button className="btn-cal-nav" onClick={handlePrevMonth} title="Mois précédent">
            <ChevronLeft size={16} /> Précédent
          </button>
          <button className="btn-cal-nav" onClick={handleNextMonth} title="Mois suivant">
            Suivant <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="week-headers">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => (
          <div key={day} className="week-day-header">{day}</div>
        ))}
      </div>

      <div className="calendar-grid">
        {weeks.map((week, wIndex) => (
          <div key={wIndex} className="calendar-week-row">
            {week.map((cell, cIndex) => {
              const cellCards = getCardsForDate(cell.date);
              return (
                <div 
                  key={cIndex} 
                  className={`calendar-cell ${cell.isCurrentMonth ? 'current-month' : 'other-month'}`}
                >
                  <div className="cell-top-row">
                    <span className="day-number">{cell.day}</span>
                    <button 
                      className="btn-cell-add" 
                      onClick={(e) => handleQuickAdd(e, cell.date)}
                      title="Planifier un post ce jour"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <div className="cell-cards-list">
                    {cellCards.map(card => {
                      const Icon = PLATFORM_ICONS[card.platform];
                      const color = PLATFORM_COLORS[card.platform];
                      
                      return (
                        <div 
                          key={card.id} 
                          className="calendar-card-tag"
                          style={{ borderLeft: `3px solid ${color}`, background: `${color}10` }}
                          onClick={() => onEditCard(card)}
                          title={`${card.title} [Statut : ${card.status === 'validate' ? 'À valider' : card.status}]`}
                        >
                          {Icon && <Icon size={10} style={{ color, marginRight: '4px' }} />}
                          <span className="card-tag-title">{card.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
