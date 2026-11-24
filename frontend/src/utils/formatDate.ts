export const formatDate = (date: string) => date.slice(0, 10);
export const todayClosing = () => {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
