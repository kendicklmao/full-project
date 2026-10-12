const cron = require('node-cron');
const Note = require('../model/note');       // Đường dẫn tới Model Note của bạn
const Member = require('../model/member');   // Đường dẫn tới Model Member của bạn
const { sendMail } = require('../helper/mailer'); // Hàm sendMail từ helper/mailer.js

const startNoteReminderJob = () => {
    // Chạy định kỳ vào 08:00 sáng mỗi ngày ('0 8 * * *')
    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron Job] Đang kiểm tra ghi chú (Notes) sắp đến hạn...');

        try {
            // 1. Tính ngày mai theo định dạng YYYY-MM-DD
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const year = tomorrow.getFullYear();
            const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const day = String(tomorrow.getDate()).padStart(2, '0');
            const tomorrowStr = `${year}-${month}-${day}`;

            // 2. Tìm các Note có date trùng với ngày mai và chưa gửi thông báo
            const notesToNotify = await Note.find({
                date: tomorrowStr,
                isNotified: { $ne: true }
            }).populate('projectId');

            for (const note of notesToNotify) {
                // 3. Lấy danh sách email thành viên thuộc dự án chứa Note này
                const members = await Member.find({ projectId: note.projectId._id }).populate('userId');
                const recipientEmails = members
                    .map(m => m.userId?.email)
                    .filter(Boolean);

                if (recipientEmails.length > 0) {
                    const projectName = note.projectId?.name || 'Project';

                    // 4. Gửi email qua mailer
                    await sendMail({
                        to: recipientEmails.join(','),
                        subject: `[Nhắc hẹn] Ghi chú trong dự án "${projectName}" vào ngày mai!`,
                        text: `Xin chào,\n\nBạn có một lịch hẹn/ghi chú trong dự án "${projectName}" sắp đến hạn vào ngày mai (${note.date}):\n\nNội dung: ${note.content}\n\nVui lòng kiểm tra trên lịch dự án.`
                    });

                    // 5. Đánh dấu đã gửi mail nhắc hẹn thành công
                    note.isNotified = true;
                    await note.save();
                }
            }
        } catch (error) {
            console.error('[Cron Job] Lỗi khi gửi mail nhắc hẹn Note:', error);
        }
    });
};

module.exports = { startNoteReminderJob };