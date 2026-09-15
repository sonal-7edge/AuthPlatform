import e from "axios";
//#region src/core/httpClient.js
function t({ baseURL: t, tokenStore: n, onRefreshToken: r, onForceLogout: i }) {
	let a = e.create({ baseURL: t }), o = !1, s = [];
	function c(e, t = null) {
		s.forEach(({ resolve: n, reject: r }) => e ? r(e) : n(t)), s = [];
	}
	return a.interceptors.request.use((e) => {
		let t = n.getIdToken();
		return t && (e.headers.Authorization = `Bearer ${t}`), e;
	}), a.interceptors.response.use((e) => e, async (e) => {
		let t = e.config;
		if (!t || e.response?.status !== 401 || t._retry) return Promise.reject(e);
		if (o) return new Promise((e, n) => s.push({
			resolve: (n) => {
				t.headers.Authorization = `Bearer ${n}`, e(a(t));
			},
			reject: n
		}));
		t._retry = !0, o = !0;
		let n = await r();
		return n.error ? (c(Error(n.message)), o = !1, i?.(), Promise.reject(e)) : (c(null, n.data.idToken), o = !1, t.headers.Authorization = `Bearer ${n.data.idToken}`, a(t));
	}), a;
}
//#endregion
//#region src/core/constants.js
var n = {
	ID_TOKEN: "auth_id_token",
	REFRESH_TOKEN: "auth_refresh_token",
	USER: "auth_user"
}, r = {
	SIGN_UP: "/auth/signup",
	SIGN_IN: "/auth/signin",
	VERIFY_OTP: "/auth/verify-otp",
	RESEND_OTP: "/auth/resend-otp",
	FORGOT_PASSWORD: "/auth/forgot-password",
	VERIFY_RESET_OTP: "/auth/verify-reset-otp",
	RESET_PASSWORD: "/auth/reset-password",
	CHANGE_PASSWORD: "/auth/change-password",
	DELETE_ACCOUNT: "/auth/delete-account",
	TOKENS: "/auth/tokens",
	REFRESH: "/auth/refresh",
	LOGOUT: "/auth/logout"
}, i = {
	EMAIL: "email",
	PHONE: "phone"
}, a = {
	AUTH: "auth",
	PASSWORD_RESET: "password-reset"
}, o = 6;
//#endregion
//#region src/core/storage.js
function s() {
	let e = /* @__PURE__ */ new Map();
	return {
		getItem: (t) => e.has(t) ? e.get(t) : null,
		setItem: (t, n) => e.set(t, n),
		removeItem: (t) => e.delete(t)
	};
}
function c(e) {
	return e || (typeof window < "u" && window.localStorage ? window.localStorage : s());
}
function l({ storage: e, keys: t } = {}) {
	let r = {
		...n,
		...t
	}, i = c(e);
	return {
		saveTokens({ idToken: e, refreshToken: t }) {
			e !== void 0 && i.setItem(r.ID_TOKEN, e), t !== void 0 && i.setItem(r.REFRESH_TOKEN, t);
		},
		getIdToken() {
			return i.getItem(r.ID_TOKEN);
		},
		getRefreshToken() {
			return i.getItem(r.REFRESH_TOKEN);
		},
		getTokens() {
			return {
				idToken: i.getItem(r.ID_TOKEN),
				refreshToken: i.getItem(r.REFRESH_TOKEN)
			};
		},
		saveUser(e) {
			i.setItem(r.USER, JSON.stringify(e));
		},
		getUser() {
			try {
				let e = i.getItem(r.USER);
				return e ? JSON.parse(e) : null;
			} catch {
				return null;
			}
		},
		clear() {
			Object.values(r).forEach((e) => i.removeItem(e));
		},
		isAuthenticated() {
			return !!i.getItem(r.ID_TOKEN);
		}
	};
}
//#endregion
//#region src/core/handleErrorResponse.js
function u(e) {
	return e.response ? {
		error: !0,
		message: e.response.data?.message || `Request failed: ${e.response.status}`,
		status: e.response.status
	} : {
		error: !0,
		message: e.message || "Network error",
		status: void 0
	};
}
//#endregion
//#region src/core/backends/httpBackend.js
function d(e) {
	async function t(t, n) {
		try {
			let { data: r } = await e.post(t, n);
			return {
				error: !1,
				data: r
			};
		} catch (e) {
			return u(e);
		}
	}
	return {
		signUp: (e) => t(r.SIGN_UP, e),
		signIn: (e) => t(r.SIGN_IN, e),
		verifyOtp: (e) => t(r.VERIFY_OTP, e),
		resendOtp: (e) => t(r.RESEND_OTP, e),
		forgotPassword: (e) => t(r.FORGOT_PASSWORD, e),
		verifyResetOtp: (e) => t(r.VERIFY_RESET_OTP, e),
		resetPassword: (e) => t(r.RESET_PASSWORD, e),
		changePassword: (e) => t(r.CHANGE_PASSWORD, e),
		deleteAccount: (e) => t(r.DELETE_ACCOUNT, e),
		fetchTokens: (e) => t(r.TOKENS, e),
		refreshToken: (e) => t(r.REFRESH, e),
		signOut: (e) => t(r.LOGOUT, e)
	};
}
//#endregion
//#region src/core/backends/mockBackend.js
var f = (e = 800) => new Promise((t) => setTimeout(t, e)), p = {
	id: "usr_mock_001",
	firstName: "Jane",
	lastName: "Doe",
	name: "Jane Doe",
	email: ""
}, m = {
	idToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfbW9ja18wMDEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJuYW1lIjoiSmFuZSBEb2UiLCJpYXQiOjE3MTcwMDAwMDAsImV4cCI6MTcxNzAwMzYwMH0.MOCK_SIGNATURE",
	refreshToken: "rt_mock_8f14e45f-ceea-467a-a866-1b1f21d791a1_refresh_token_placeholder"
}, h = "123456", g = "rst_mock_token_abc123";
function _() {
	return {
		async signUp() {
			return await f(), {
				error: !1,
				data: { message: "OTP sent to your email" }
			};
		},
		async signIn(e) {
			await f();
			let t = e.email || e.phone;
			return t === "fail@test.com" || t === "0000000000" ? {
				error: !0,
				message: "Invalid credentials",
				status: 401
			} : {
				error: !1,
				data: { message: "OTP sent to your registered contact" }
			};
		},
		async verifyOtp(e) {
			return await f(), e.otp === h ? {
				error: !1,
				data: {
					...m,
					user: {
						...p,
						email: e.identifier
					}
				}
			} : {
				error: !0,
				message: `Invalid OTP. Use "${h}" in mock mode.`,
				status: 400
			};
		},
		async forgotPassword() {
			return await f(), {
				error: !1,
				data: { message: "Password reset OTP sent" }
			};
		},
		async verifyResetOtp(e) {
			return await f(), e.otp === h ? {
				error: !1,
				data: { resetToken: g }
			} : {
				error: !0,
				message: `Invalid OTP. Use "${h}" in mock mode.`,
				status: 400
			};
		},
		async resetPassword() {
			return await f(), {
				error: !1,
				data: { message: "Password reset successfully" }
			};
		},
		async changePassword(e) {
			return await f(), e.currentPassword === "wrongpassword" ? {
				error: !0,
				message: "Current password is incorrect",
				status: 400
			} : {
				error: !1,
				data: { message: "Password changed successfully" }
			};
		},
		async deleteAccount(e) {
			return await f(), e.password === "wrongpassword" ? {
				error: !0,
				message: "Incorrect password",
				status: 400
			} : {
				error: !1,
				data: { message: "Account deleted successfully" }
			};
		},
		async fetchTokens() {
			return await f(400), {
				error: !1,
				data: { ...m }
			};
		},
		async refreshToken() {
			return await f(400), {
				error: !1,
				data: {
					idToken: m.idToken + "_refreshed",
					refreshToken: m.refreshToken + "_new"
				}
			};
		},
		async resendOtp() {
			return await f(600), {
				error: !1,
				data: { message: "OTP resent" }
			};
		},
		async signOut() {
			return await f(300), {
				error: !1,
				data: { message: "Signed out" }
			};
		}
	};
}
//#endregion
//#region src/core/createAuthClient.js
function v(e = {}) {
	let { baseURL: n = "", useMock: r = !1, storage: i, storageKeys: a, onForceLogout: o } = e, s = l({
		storage: i,
		keys: a
	}), c = {
		isAuthenticated: s.isAuthenticated(),
		user: s.getUser(),
		idToken: s.getIdToken(),
		refreshToken: s.getRefreshToken(),
		isLoading: !1,
		error: null
	}, u = /* @__PURE__ */ new Set();
	function f() {
		return c;
	}
	function p(e) {
		c = {
			...c,
			...e
		}, u.forEach((e) => e(c));
	}
	function m(e) {
		return u.add(e), () => u.delete(e);
	}
	function h() {
		s.clear(), p({
			isAuthenticated: !1,
			user: null,
			idToken: null,
			refreshToken: null
		});
	}
	function g() {
		h(), o?.();
	}
	async function v(e) {
		p({
			isLoading: !0,
			error: null
		});
		let t = await e();
		return p({
			isLoading: !1,
			error: t.error ? t.message : null
		}), t;
	}
	let y = r ? _() : d(t({
		baseURL: n,
		tokenStore: s,
		onRefreshToken: () => A(),
		onForceLogout: g
	}));
	function b(e) {
		return v(() => y.signUp(e));
	}
	function x(e) {
		return v(() => y.signIn(e));
	}
	function S(e) {
		return v(async () => {
			let t = await y.verifyOtp(e);
			return t.error || (s.saveTokens(t.data), s.saveUser(t.data.user), p({
				isAuthenticated: !0,
				user: t.data.user,
				idToken: t.data.idToken,
				refreshToken: t.data.refreshToken
			})), t;
		});
	}
	function C(e) {
		return v(() => y.resendOtp(e));
	}
	function w(e) {
		return v(() => y.forgotPassword(e));
	}
	function T(e) {
		return v(() => y.verifyResetOtp(e));
	}
	function E(e) {
		return v(() => y.resetPassword(e));
	}
	function D(e) {
		return v(() => y.changePassword(e));
	}
	function O(e) {
		return v(async () => {
			let t = await y.deleteAccount(e);
			return h(), t;
		});
	}
	function k() {
		return v(async () => {
			let e = await y.fetchTokens({ email: c.user?.email });
			return e.error || (s.saveTokens(e.data), p({
				idToken: e.data.idToken,
				refreshToken: e.data.refreshToken
			})), e;
		});
	}
	function A() {
		return v(async () => {
			let e = await y.refreshToken({ refreshToken: s.getRefreshToken() });
			return e.error ? (g(), e) : (s.saveTokens(e.data), p({
				idToken: e.data.idToken,
				refreshToken: e.data.refreshToken
			}), e);
		});
	}
	function j() {
		return v(async () => {
			let e = await y.signOut({ refreshToken: s.getRefreshToken() });
			return h(), e;
		});
	}
	return {
		getState: f,
		subscribe: m,
		signUp: b,
		signIn: x,
		login: x,
		verifyOtp: S,
		resendOtp: C,
		forgotPassword: w,
		verifyResetOtp: T,
		resetPassword: E,
		changePassword: D,
		deleteAccount: O,
		fetchTokens: k,
		refreshToken: A,
		signOut: j,
		logout: j
	};
}
//#endregion
export { n as a, a as c, r as i, u as n, i as o, l as r, o as s, v as t };
