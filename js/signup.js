// ===== ViewModel صفحه‌ی ثبت‌نام =====
// قوانین دقیقاً با قوانین سرور یکی است (سرور در هر حال دوباره بررسی می‌کند).
var USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
var PASSWORD_MIN = 8;
var PASSWORD_MAX = 128;

function SignUpViewModel() {
  var self = this;

  self.username = ko.observable('');
  self.password = ko.observable('');
  self.confirmPassword = ko.observable('');
  self.errorMessage = ko.observable('');
  self.isLoading = ko.observable(false);

  // خطاهای فیلدها بعد از اولین تلاش برای ارسال نمایش داده می‌شوند (نه همان لحظه‌ی شروع تایپ)
  self.showErrors = ko.observable(false);

  // ----- اعتبارسنجی زنده با computed -----
  self.usernameError = ko.pureComputed(function () {
    return USERNAME_RE.test(self.username().trim())
      ? ''
      : 'نام کاربری باید ۳ تا ۳۰ حرف انگلیسی، عدد یا . _ - باشد.';
  });

  self.passwordError = ko.pureComputed(function () {
    var p = self.password();
    if (p.length < PASSWORD_MIN) return 'رمز عبور باید حداقل ' + PASSWORD_MIN + ' کاراکتر باشد.';
    if (p.length > PASSWORD_MAX) return 'رمز عبور نباید بیشتر از ' + PASSWORD_MAX + ' کاراکتر باشد.';
    return '';
  });

  self.confirmError = ko.pureComputed(function () {
    return self.password() === self.confirmPassword() ? '' : 'رمز عبور و تکرار آن یکسان نیستند.';
  });

  self.isValid = ko.pureComputed(function () {
    return !self.usernameError() && !self.passwordError() && !self.confirmError();
  });

  // ----- ارسال فرم -----
  self.submit = function () {
    if (self.isLoading()) return;

    self.errorMessage('');
    self.showErrors(true);
    if (!self.isValid()) return;

    self.isLoading(true);

    Auth.submitCredentials('/api/auth/signup', self.username().trim(), self.password())
      .then(function (result) {
        // سرور بعد از ثبت‌نام، توکن هم می‌دهد؛ پس کاربر بدون ورود دوباره وارد برنامه می‌شود
        Auth.setSession(result.token, result.user);
        Auth.navigate('index.html');
      })
      .catch(function (err) {
        self.errorMessage(err.message);
      })
      .finally(function () {
        self.isLoading(false);
      });
  };
}

// اگر کاربر قبلاً وارد شده باشد، مستقیم به برنامه می‌رود
if (!Auth.redirectIfLoggedIn()) {
  ko.applyBindings(new SignUpViewModel());
}
