export const formatDuration = (minutes) => {
  if (!minutes) return '';
  const numMinutes = parseInt(minutes, 10);
  if (isNaN(numMinutes)) return minutes;
  
  const hours = Math.floor(numMinutes / 60);
  const mins = numMinutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return `${mins} min${mins !== 1 ? 's' : ''}`;
  }
};
