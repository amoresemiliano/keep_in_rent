export const filterByDate = (data, field, start, end) => {
    return data.filter(item => item[field] >= start && item[field] <= end);
};

export const filterBookings = (bookings, filters) => {
    let result = filterByDate(bookings, 'checkin', filters.start, filters.end);
    if (filters.platform) result = result.filter(b => b.platform === filters.platform);
    if (filters.origin) result = result.filter(b => b.origin === filters.origin);
    return result;
};

export const filterExpenses = (expenses, filters) => {
    let result = filterByDate(expenses, 'date', filters.start, filters.end);
    if (filters.type) result = result.filter(e => e.category === filters.type);
    return result;
};