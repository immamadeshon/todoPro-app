// ===== ViewModel صفحه‌ی ورود =====
function SignInViewModel() {
  var self = this;

  self.username = ko.observable('');
  self.password = ko.observable('');
  self.errorMessage = ko.observable('');
  self.isLoading = ko.observable(false);

  // اگر کاربر به‌خاطر انقضای نشست به این صفحه آمده باشد (?expired=1) پیام نشان می‌دهیم
  self.infoMessage = ko.observable(
    /[?&]expired=1/.test(window.location.search) ? 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.' : ''
  );

  self.submit = function () {
    if (self.isLoading()) return;

    var username = self.username().trim();
    var password = self.password();

    self.errorMessage('');
    self.infoMessage('');

    if (username === '' || password === '') {
      self.errorMessage('نام کاربری و رمز عبور را وارد کنید.');
      return;
    }

    self.isLoading(true);

    Auth.submitCredentials('/api/auth/signin', username, password)
      .then(function (result) {
        Auth.setSession(result.token, result.user); // ذخیره‌ی توکن
        Auth.navigate('index.html');               // رفتن به برنامه
      })
      .catch(function (err) {
        self.errorMessage(err.message);
        self.password(''); // رمز اشتباه را پاک می‌کنیم
      })
      .finally(function () {
        self.isLoading(false);
      });
  };
}

// اگر کاربر قبلاً وارد شده باشد، مستقیم به برنامه می‌رود
if (!Auth.redirectIfLoggedIn()) {
  ko.applyBindings(new SignInViewModel());
}
