# Hướng dẫn chạy crawler và tạo `questions_all_filled.csv`

Dưới đây là các bước ngắn để tái tạo đầu ra như file `questions_all_filled.csv` trong thư mục `crawler`.

Yêu cầu trước khi chạy
- Node.js (v16+ hoặc v18+) và `npm`
- Kết nối mạng cho việc truy cập trang và API

1) Cài phụ thuộc

```bash
cd /Users/hoangtien/Desktop/data\ crawl/crawler
npm install
```

2) Lấy danh sách bài tập (tạo `questions_all.csv`)
- Chạy script thu thập/extract (script này gọi API category và/hoặc parse captures):

```bash
node fetch_and_extract_all.js
```

Sau khi chạy xong sẽ tạo `questions_all.csv`.

3) Chạy headful để bắt các POST `submit` và result pages (tương tác trình duyệt)
- Nếu còn nhiều câu thiếu đáp án, dùng script headful (yêu cầu mở trình duyệt và login nếu cần). Script sẽ ghi các captures vào `network_captures_submit_missing.json` hoặc tương tự.

```bash
# headful, dừng để bạn login nếu cần
node headful_submit_selected.js
```

Ghi chú: script này chạy ở chế độ headful (mở cửa sổ Chrome) và sẽ tạm dừng để bạn đăng nhập nếu site yêu cầu. Nó cố click "Bắt đầu"/"Nộp bài"/"Xem đáp án" và lưu responses.

4) Merge captures vào CSV (tạo `questions_all_filled.csv`)
- Sau khi có các file captures (ví dụ `network_captures.json`, `network_captures_all.json`, `network_captures_submit.json`, `network_captures_submit_missing.json`), chạy:

```bash
node fill_correct_answers.js
```

Kết quả: `questions_all_filled.csv` — file gốc `questions_all.csv` được cập nhật cột `correct_option` và `correct_text` từ các captures.

5) Kiểm tra các câu còn thiếu

```bash
node list_missing.js
```

Script này sẽ sinh `questions_missing_answers.csv` (các câu chưa có `correct_text`) và in ra một danh sách mẫu.

6) Nếu muốn xây danh sách exam để chạy headful cho các đề thiếu

```bash
node build_missing_exam_list.js
```

File `missing_exams.json` sẽ được sinh — dùng làm input cho `headful_submit_selected.js`.

Lưu ý và mẹo
- Luôn để `node_modules` và file kết quả (CSV, JSON capture) trong `.gitignore` nếu bạn không muốn push chúng lên remote.
- Các trang có thể thay đổi giao diện/selector — nếu headful không click được nút, cần mở `headful_submit_selected.js` sửa selector/text heuristics.
- Nếu script không tìm thấy captures, mở DevTools trên cửa sổ headful để quan sát các network request và điều chỉnh chọn lọc URL/regex trong script.

Các file chính bạn sẽ dùng
- `fetch_and_extract_all.js` — thu danh sách bài và tạo `questions_all.csv`.
- `headful_submit_selected.js` — chạy headful Puppeteer để capture POST/response/result HTML.
- `fill_correct_answers.js` — ghép captures vào `questions_all.csv` → `questions_all_filled.csv`.
- `list_missing.js` — liệt kê các câu còn thiếu `correct_text`.
- `build_missing_exam_list.js` — xây `missing_exams.json` từ file missing.

Thêm trợ giúp
nếu bạn muốn mình tạo thêm một script chuyển `questions_all_filled.csv` sang JSON (`questions_all_filled.json`) hoặc chỉ dẫn chi tiết cách cấu hình headful (chế độ headless/headful, chờ login), bảo mình để mình làm tiếp.

---
File này được đặt tại: `RUNNING.md` (trong thư mục `crawler`).
