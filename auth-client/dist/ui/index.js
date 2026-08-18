import { c as e, o as t } from "../createAuthClient-BEW9IoGj.js";
import { t as n } from "../useAuth-3P0rfvH9.js";
import { useCallback as r, useEffect as i, useRef as a, useState as o } from "react";
import { jsx as s, jsxs as c } from "react/jsx-runtime";
//#region src/ui/components/AuthCard/index.jsx
function l({ title: e, subtitle: t, children: n }) {
	return /* @__PURE__ */ s("div", {
		className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark p-4",
		children: /* @__PURE__ */ c("div", {
			className: "bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md",
			children: [/* @__PURE__ */ c("div", {
				className: "text-center mb-7",
				children: [/* @__PURE__ */ s("h1", {
					className: "text-2xl font-bold text-gray-900 mb-1",
					children: e
				}), t && /* @__PURE__ */ s("p", {
					className: "text-sm text-gray-500",
					children: t
				})]
			}), n]
		})
	});
}
//#endregion
//#region src/ui/components/FormField/index.jsx
function u({ label: e, error: t, ...n }) {
	return /* @__PURE__ */ c("div", {
		className: "flex flex-col gap-1 mb-4",
		children: [
			e && /* @__PURE__ */ s("label", {
				className: "text-sm font-medium text-gray-700",
				children: e
			}),
			/* @__PURE__ */ s("input", {
				className: `px-3.5 py-2.5 rounded-lg border text-sm text-gray-900 outline-none transition-shadow
          focus:ring-2 focus:ring-primary/30
          ${t ? "border-red-400 focus:ring-red-200" : "border-gray-300 focus:border-primary"}`,
				...n
			}),
			t && /* @__PURE__ */ s("span", {
				className: "text-xs text-red-500",
				children: t
			})
		]
	});
}
//#endregion
//#region src/ui/components/IdentifierInput/index.jsx
function d({ type: e, value: n, onChange: r, error: i, onTypeChange: a }) {
	return /* @__PURE__ */ c("div", { children: [/* @__PURE__ */ s("div", {
		className: "flex bg-gray-100 rounded-lg p-0.5 mb-3",
		children: [t.EMAIL, t.PHONE].map((n) => /* @__PURE__ */ s("button", {
			type: "button",
			onClick: () => a(n),
			className: `flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${e === n ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`,
			children: n === t.EMAIL ? "Email" : "Phone"
		}, n))
	}), /* @__PURE__ */ s(u, {
		label: e === t.EMAIL ? "Email" : "Phone number",
		type: e === t.EMAIL ? "email" : "tel",
		placeholder: e === t.EMAIL ? "you@example.com" : "+1 234 567 8900",
		value: n,
		onChange: r,
		error: i,
		autoComplete: e === t.EMAIL ? "email" : "tel"
	})] });
}
//#endregion
//#region src/ui/components/PasswordField/index.jsx
function f() {
	return /* @__PURE__ */ c("svg", {
		width: "18",
		height: "18",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [/* @__PURE__ */ s("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), /* @__PURE__ */ s("circle", {
			cx: "12",
			cy: "12",
			r: "3"
		})]
	});
}
function p() {
	return /* @__PURE__ */ c("svg", {
		width: "18",
		height: "18",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [
			/* @__PURE__ */ s("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" }),
			/* @__PURE__ */ s("path", { d: "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" }),
			/* @__PURE__ */ s("line", {
				x1: "1",
				y1: "1",
				x2: "23",
				y2: "23"
			})
		]
	});
}
function m(e) {
	if (!e || e.length < 8) return 0;
	let t = 1;
	return e.length >= 12 && t++, /[A-Z]/.test(e) && t++, /[0-9]/.test(e) && t++, /[^A-Za-z0-9]/.test(e) && t++, t;
}
var h = [
	null,
	{
		label: "Weak",
		bar: "bg-red-500",
		text: "text-red-500"
	},
	{
		label: "Fair",
		bar: "bg-orange-400",
		text: "text-orange-500"
	},
	{
		label: "Good",
		bar: "bg-yellow-500",
		text: "text-yellow-600"
	},
	{
		label: "Strong",
		bar: "bg-blue-500",
		text: "text-blue-600"
	},
	{
		label: "Very strong",
		bar: "bg-green-500",
		text: "text-green-600"
	}
];
function g({ value: e }) {
	let t = m(e), n = h[t];
	return /* @__PURE__ */ c("div", {
		className: "mt-1.5 mb-0.5",
		children: [/* @__PURE__ */ s("div", {
			className: "flex gap-1",
			children: [
				1,
				2,
				3,
				4,
				5
			].map((e) => /* @__PURE__ */ s("div", { className: `h-1 flex-1 rounded-full transition-all duration-300 ${e <= t ? h[t]?.bar ?? "bg-gray-200" : "bg-gray-200"}` }, e))
		}), n && /* @__PURE__ */ s("p", {
			className: `text-xs mt-0.5 ${n.text}`,
			children: n.label
		})]
	});
}
function _({ label: e, error: t, showStrength: n, value: r, onChange: i, ...a }) {
	let [l, u] = o(!1);
	return /* @__PURE__ */ c("div", {
		className: "flex flex-col gap-1 mb-4",
		children: [
			e && /* @__PURE__ */ s("label", {
				className: "text-sm font-medium text-gray-700",
				children: e
			}),
			/* @__PURE__ */ c("div", {
				className: "relative",
				children: [/* @__PURE__ */ s("input", {
					type: l ? "text" : "password",
					value: r,
					onChange: i,
					className: `w-full px-3.5 py-2.5 pr-11 rounded-lg border text-sm text-gray-900 outline-none transition-shadow
            focus:ring-2 focus:ring-primary/30
            ${t ? "border-red-400 focus:ring-red-200" : "border-gray-300 focus:border-primary"}`,
					...a
				}), /* @__PURE__ */ s("button", {
					type: "button",
					onClick: () => u((e) => !e),
					tabIndex: -1,
					"aria-label": l ? "Hide password" : "Show password",
					className: "absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors",
					children: s(l ? p : f, {})
				})]
			}),
			n && r && /* @__PURE__ */ s(g, { value: r }),
			t && /* @__PURE__ */ s("span", {
				className: "text-xs text-red-500",
				children: t
			})
		]
	});
}
//#endregion
//#region src/ui/components/LoadingSpinner/index.jsx
function v({ size: e = "h-5 w-5", color: t = "border-white" }) {
	return /* @__PURE__ */ s("span", { className: `inline-block ${e} rounded-full border-2 border-t-transparent ${t} animate-spin` });
}
//#endregion
//#region src/ui/components/Button/index.jsx
function y({ text: e, handleClick: t, loading: n, type: r = "button", disabled: i }) {
	return /* @__PURE__ */ s("button", {
		type: r,
		disabled: i || n,
		onClick: t,
		className: `w-full h-11 rounded-lg font-semibold text-white transition-opacity flex items-center justify-center
        ${i || n ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"}
        bg-gradient-to-r from-primary to-primary-dark`,
		children: n ? /* @__PURE__ */ s(v, {}) : e
	});
}
//#endregion
//#region src/ui/constants.js
var b = {
	SIGN_IN: "signin",
	SIGN_UP: "signup",
	OTP: "otp",
	FORGOT_PASSWORD: "forgot-password",
	RESET_PASSWORD_OTP: "reset-password-otp",
	RESET_PASSWORD: "reset-password"
};
//#endregion
//#region src/ui/screens/SignIn.jsx
function x({ setFlow: r }) {
	let { signIn: i, isLoading: a, error: u } = n(), [f, p] = o(t.EMAIL), [m, h] = o({
		identifier: "",
		password: ""
	}), [g, v] = o({});
	function x() {
		let e = {};
		return f === t.EMAIL ? m.identifier ? /\S+@\S+\.\S+/.test(m.identifier) || (e.identifier = "Enter a valid email") : e.identifier = "Email is required" : m.identifier ? /^\+?\d{7,15}$/.test(m.identifier.replace(/\s/g, "")) || (e.identifier = "Enter a valid phone number") : e.identifier = "Phone number is required", m.password || (e.password = "Password is required"), e;
	}
	async function S(n) {
		n.preventDefault();
		let a = x();
		if (Object.keys(a).length) {
			v(a);
			return;
		}
		v({}), (await i({
			[f === t.EMAIL ? "email" : "phone"]: m.identifier,
			password: m.password
		})).error || r({
			pendingIdentifier: m.identifier,
			identifierType: f,
			otpPurpose: e.AUTH,
			screen: b.OTP
		});
	}
	let C = (e) => (t) => h((n) => ({
		...n,
		[e]: t.target.value
	}));
	return /* @__PURE__ */ c(l, {
		title: "Welcome back",
		subtitle: "Sign in to your account",
		children: [/* @__PURE__ */ c("form", {
			onSubmit: S,
			noValidate: !0,
			children: [
				/* @__PURE__ */ s(d, {
					type: f,
					value: m.identifier,
					onChange: C("identifier"),
					error: g.identifier,
					onTypeChange: (e) => {
						p(e), h((e) => ({
							...e,
							identifier: ""
						})), v({});
					}
				}),
				/* @__PURE__ */ s(_, {
					label: "Password",
					placeholder: "••••••••",
					value: m.password,
					onChange: C("password"),
					error: g.password,
					autoComplete: "current-password"
				}),
				/* @__PURE__ */ s("div", {
					className: "flex justify-end mb-4 -mt-2",
					children: /* @__PURE__ */ s("button", {
						type: "button",
						className: "text-xs font-medium text-primary hover:text-primary-dark underline underline-offset-2",
						onClick: () => r({ screen: b.FORGOT_PASSWORD }),
						children: "Forgot password?"
					})
				}),
				u && /* @__PURE__ */ s("p", {
					className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: u
				}),
				/* @__PURE__ */ s(y, {
					type: "submit",
					text: "Sign In",
					loading: a
				})
			]
		}), /* @__PURE__ */ c("p", {
			className: "text-center mt-5 text-sm text-gray-500",
			children: [
				"Don't have an account?",
				" ",
				/* @__PURE__ */ s("button", {
					className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark",
					onClick: () => r({ screen: b.SIGN_UP }),
					children: "Sign up"
				})
			]
		})]
	});
}
//#endregion
//#region src/ui/screens/SignUp.jsx
function S({ setFlow: r }) {
	let { signUp: i, isLoading: a, error: f } = n(), [p, m] = o(t.EMAIL), [h, g] = o({
		firstName: "",
		lastName: "",
		identifier: "",
		password: "",
		confirm: ""
	}), [v, x] = o({});
	function S() {
		let e = {};
		return h.firstName.trim() || (e.firstName = "First name is required"), h.lastName.trim() || (e.lastName = "Last name is required"), p === t.EMAIL ? h.identifier ? /\S+@\S+\.\S+/.test(h.identifier) || (e.identifier = "Enter a valid email") : e.identifier = "Email is required" : h.identifier ? /^\+?\d{7,15}$/.test(h.identifier.replace(/\s/g, "")) || (e.identifier = "Enter a valid phone number") : e.identifier = "Phone number is required", h.password ? h.password.length < 8 && (e.password = "Minimum 8 characters") : e.password = "Password is required", h.confirm !== h.password && (e.confirm = "Passwords do not match"), e;
	}
	async function C(n) {
		n.preventDefault();
		let a = S();
		if (Object.keys(a).length) {
			x(a);
			return;
		}
		x({}), (await i({
			firstName: h.firstName.trim(),
			lastName: h.lastName.trim(),
			[p === t.EMAIL ? "email" : "phone"]: h.identifier,
			password: h.password
		})).error || r({
			pendingIdentifier: h.identifier,
			identifierType: p,
			otpPurpose: e.AUTH,
			screen: b.OTP
		});
	}
	let w = (e) => (t) => g((n) => ({
		...n,
		[e]: t.target.value
	}));
	return /* @__PURE__ */ c(l, {
		title: "Create account",
		subtitle: "Sign up to get started",
		children: [/* @__PURE__ */ c("form", {
			onSubmit: C,
			noValidate: !0,
			children: [
				/* @__PURE__ */ c("div", {
					className: "flex gap-3",
					children: [/* @__PURE__ */ s("div", {
						className: "flex-1",
						children: /* @__PURE__ */ s(u, {
							label: "First name",
							type: "text",
							placeholder: "Jane",
							value: h.firstName,
							onChange: w("firstName"),
							error: v.firstName,
							autoComplete: "given-name"
						})
					}), /* @__PURE__ */ s("div", {
						className: "flex-1",
						children: /* @__PURE__ */ s(u, {
							label: "Last name",
							type: "text",
							placeholder: "Doe",
							value: h.lastName,
							onChange: w("lastName"),
							error: v.lastName,
							autoComplete: "family-name"
						})
					})]
				}),
				/* @__PURE__ */ s(d, {
					type: p,
					value: h.identifier,
					onChange: w("identifier"),
					error: v.identifier,
					onTypeChange: (e) => {
						m(e), g((e) => ({
							...e,
							identifier: ""
						})), x({});
					}
				}),
				/* @__PURE__ */ s(_, {
					label: "Password",
					placeholder: "Min. 8 characters",
					value: h.password,
					onChange: w("password"),
					error: v.password,
					autoComplete: "new-password",
					showStrength: !0
				}),
				/* @__PURE__ */ s(_, {
					label: "Confirm password",
					placeholder: "Re-enter password",
					value: h.confirm,
					onChange: w("confirm"),
					error: v.confirm,
					autoComplete: "new-password"
				}),
				f && /* @__PURE__ */ s("p", {
					className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: f
				}),
				/* @__PURE__ */ s(y, {
					type: "submit",
					text: "Create Account",
					loading: a
				})
			]
		}), /* @__PURE__ */ c("p", {
			className: "text-center mt-5 text-sm text-gray-500",
			children: [
				"Already have an account?",
				" ",
				/* @__PURE__ */ s("button", {
					className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark",
					onClick: () => r({ screen: b.SIGN_IN }),
					children: "Sign in"
				})
			]
		})]
	});
}
//#endregion
//#region src/ui/screens/OtpVerify.jsx
var C = 60;
function w({ flow: u, setFlow: d, onAuthenticated: f }) {
	let { verifyOtp: p, verifyResetOtp: m, resendOtp: h, isLoading: g, error: _ } = n(), { pendingIdentifier: v, identifierType: x, otpPurpose: S } = u, [w, T] = o([
		,
		,
		,
		,
		,
		,
	].fill("")), [E, D] = o(C), [O, k] = o(!1), A = a([]), j = a(null);
	i(() => (A.current[0]?.focus(), M(), () => clearInterval(j.current)), []);
	function M() {
		clearInterval(j.current), D(C), j.current = setInterval(() => {
			D((e) => e <= 1 ? (clearInterval(j.current), 0) : e - 1);
		}, 1e3);
	}
	let N = r(async (t) => {
		let n = {
			identifier: v,
			otp: t
		};
		if (S === e.PASSWORD_RESET) {
			let e = await m(n);
			e.error || d({
				resetToken: e.data.resetToken,
				screen: b.RESET_PASSWORD
			});
		} else (await p(n)).error || (d({
			pendingIdentifier: null,
			screen: b.SIGN_IN
		}), f?.());
	}, [
		v,
		S,
		p,
		m,
		d,
		f
	]);
	function P(e, t) {
		let n = t.replace(/\D/g, "").slice(-1), r = [...w];
		if (r[e] = n, T(r), n && e < 5 && A.current[e + 1]?.focus(), n && e === 5) {
			let e = r.join("");
			e.length === 6 && N(e);
		}
	}
	function F(e, t) {
		t.key === "Backspace" && !w[e] && e > 0 && A.current[e - 1]?.focus();
	}
	function I(e) {
		e.preventDefault();
		let t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6), n = [...w];
		for (let e = 0; e < t.length; e++) n[e] = t[e];
		T(n);
		let r = Math.min(t.length, 5);
		A.current[r]?.focus(), t.length === 6 && N(t);
	}
	function L(e) {
		e.preventDefault();
		let t = w.join("");
		t.length < 6 || N(t);
	}
	async function R() {
		k(!1), (await h({
			identifier: v,
			purpose: S
		})).error || (T([
			,
			,
			,
			,
			,
			,
		].fill("")), A.current[0]?.focus(), k(!0), M(), setTimeout(() => k(!1), 4e3));
	}
	let z = w.join(""), B = x === t.PHONE ? "phone" : "email", V = S === e.PASSWORD_RESET ? b.FORGOT_PASSWORD : b.SIGN_IN;
	return /* @__PURE__ */ c(l, {
		title: S === e.PASSWORD_RESET ? "Verify to reset" : `Verify your ${B}`,
		subtitle: `We sent a 6-digit code to ${v || `your ${B}`}`,
		children: [/* @__PURE__ */ c("form", {
			onSubmit: L,
			children: [
				/* @__PURE__ */ s("div", {
					className: "flex gap-2 justify-center mb-6",
					onPaste: I,
					children: w.map((e, t) => /* @__PURE__ */ s("input", {
						ref: (e) => A.current[t] = e,
						type: "text",
						inputMode: "numeric",
						maxLength: 1,
						value: e,
						onChange: (e) => P(t, e.target.value),
						onKeyDown: (e) => F(t, e),
						className: `w-11 h-14 text-center text-xl font-semibold rounded-xl border-2 outline-none
                caret-transparent transition-all
                ${e ? "border-primary bg-primary/5 text-gray-900" : "border-gray-300 text-gray-900"}
                focus:border-primary focus:ring-2 focus:ring-primary/20`
					}, t))
				}),
				O && /* @__PURE__ */ s("p", {
					className: "text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: "A new code has been sent."
				}),
				_ && /* @__PURE__ */ s("p", {
					className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: _
				}),
				/* @__PURE__ */ s(y, {
					type: "submit",
					text: "Verify OTP",
					loading: g,
					disabled: z.length < 6
				})
			]
		}), /* @__PURE__ */ c("div", {
			className: "flex items-center justify-between mt-5 text-sm text-gray-500",
			children: [/* @__PURE__ */ s("button", {
				className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark",
				onClick: () => d({ screen: V }),
				children: "← Back"
			}), E > 0 ? /* @__PURE__ */ c("span", {
				className: "text-gray-400",
				children: ["Resend in ", /* @__PURE__ */ c("span", {
					className: "tabular-nums",
					children: [E, "s"]
				})]
			}) : /* @__PURE__ */ s("button", {
				className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark disabled:opacity-50",
				onClick: R,
				disabled: g,
				children: "Resend OTP"
			})]
		})]
	});
}
//#endregion
//#region src/ui/screens/ForgotPassword.jsx
function T({ setFlow: r }) {
	let { forgotPassword: i, isLoading: a, error: u } = n(), [f, p] = o(t.EMAIL), [m, h] = o(""), [g, _] = o("");
	function v() {
		return m ? f === t.EMAIL && !/\S+@\S+\.\S+/.test(m) ? "Enter a valid email" : f === t.PHONE && !/^\+?\d{7,15}$/.test(m.replace(/\s/g, "")) ? "Enter a valid phone number" : "" : f === t.EMAIL ? "Email is required" : "Phone number is required";
	}
	async function x(t) {
		t.preventDefault();
		let n = v();
		if (n) {
			_(n);
			return;
		}
		_(""), (await i({
			identifier: m,
			identifierType: f
		})).error || r({
			pendingIdentifier: m,
			identifierType: f,
			otpPurpose: e.PASSWORD_RESET,
			screen: b.RESET_PASSWORD_OTP
		});
	}
	return /* @__PURE__ */ c(l, {
		title: "Forgot password",
		subtitle: "We'll send a reset code to your registered contact",
		children: [/* @__PURE__ */ c("form", {
			onSubmit: x,
			noValidate: !0,
			children: [
				/* @__PURE__ */ s(d, {
					type: f,
					value: m,
					onChange: (e) => h(e.target.value),
					error: g,
					onTypeChange: (e) => {
						p(e), h(""), _("");
					}
				}),
				u && /* @__PURE__ */ s("p", {
					className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: u
				}),
				/* @__PURE__ */ s(y, {
					type: "submit",
					text: "Send Reset Code",
					loading: a
				})
			]
		}), /* @__PURE__ */ c("p", {
			className: "text-center mt-5 text-sm text-gray-500",
			children: [
				"Remember your password?",
				" ",
				/* @__PURE__ */ s("button", {
					className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark",
					onClick: () => r({ screen: b.SIGN_IN }),
					children: "Sign in"
				})
			]
		})]
	});
}
//#endregion
//#region src/ui/screens/ResetPassword.jsx
function E({ flow: e, setFlow: t }) {
	let { resetPassword: r, isLoading: i, error: a } = n(), { pendingIdentifier: u, resetToken: d } = e, [f, p] = o({
		password: "",
		confirm: ""
	}), [m, h] = o({});
	function g() {
		let e = {};
		return f.password ? f.password.length < 8 && (e.password = "Minimum 8 characters") : e.password = "Password is required", f.confirm !== f.password && (e.confirm = "Passwords do not match"), e;
	}
	async function v(e) {
		e.preventDefault();
		let n = g();
		if (Object.keys(n).length) {
			h(n);
			return;
		}
		h({}), (await r({
			identifier: u,
			resetToken: d,
			newPassword: f.password
		})).error || t({
			screen: b.SIGN_IN,
			resetToken: null,
			pendingIdentifier: null
		});
	}
	let x = (e) => (t) => p((n) => ({
		...n,
		[e]: t.target.value
	}));
	return /* @__PURE__ */ s(l, {
		title: "Set new password",
		subtitle: "Choose a strong password for your account",
		children: /* @__PURE__ */ c("form", {
			onSubmit: v,
			noValidate: !0,
			children: [
				/* @__PURE__ */ s(_, {
					label: "New password",
					placeholder: "Min. 8 characters",
					value: f.password,
					onChange: x("password"),
					error: m.password,
					autoComplete: "new-password",
					showStrength: !0
				}),
				/* @__PURE__ */ s(_, {
					label: "Confirm new password",
					placeholder: "Re-enter password",
					value: f.confirm,
					onChange: x("confirm"),
					error: m.confirm,
					autoComplete: "new-password"
				}),
				a && /* @__PURE__ */ s("p", {
					className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: a
				}),
				/* @__PURE__ */ s(y, {
					type: "submit",
					text: "Reset Password",
					loading: i
				})
			]
		})
	});
}
//#endregion
//#region src/ui/AuthFlow.jsx
function D({ initialScreen: n = b.SIGN_IN, onAuthenticated: r }) {
	let [i, a] = o({
		screen: n,
		pendingIdentifier: null,
		identifierType: t.EMAIL,
		otpPurpose: e.AUTH,
		resetToken: null
	});
	function c(e) {
		a((t) => ({
			...t,
			...e
		}));
	}
	let l = {
		flow: i,
		setFlow: c,
		onAuthenticated: r
	};
	switch (i.screen) {
		case b.SIGN_UP: return /* @__PURE__ */ s(S, { ...l });
		case b.OTP:
		case b.RESET_PASSWORD_OTP: return /* @__PURE__ */ s(w, { ...l });
		case b.FORGOT_PASSWORD: return /* @__PURE__ */ s(T, { ...l });
		case b.RESET_PASSWORD: return /* @__PURE__ */ s(E, { ...l });
		default: return /* @__PURE__ */ s(x, { ...l });
	}
}
//#endregion
//#region src/ui/screens/ChangePassword.jsx
function O({ onSuccess: e, onCancel: t }) {
	let { changePassword: r, isLoading: i, error: a } = n(), [u, d] = o({
		current: "",
		password: "",
		confirm: ""
	}), [f, p] = o({}), [m, h] = o(!1);
	function g() {
		let e = {};
		return u.current || (e.current = "Current password is required"), u.password ? u.password.length < 8 ? e.password = "Minimum 8 characters" : u.password === u.current && (e.password = "New password must differ from current") : e.password = "New password is required", u.confirm !== u.password && (e.confirm = "Passwords do not match"), e;
	}
	async function v(t) {
		t.preventDefault();
		let n = g();
		if (Object.keys(n).length) {
			p(n);
			return;
		}
		p({}), (await r({
			currentPassword: u.current,
			newPassword: u.password
		})).error || (h(!0), setTimeout(() => e?.(), 1800));
	}
	let b = (e) => (t) => d((n) => ({
		...n,
		[e]: t.target.value
	}));
	return /* @__PURE__ */ c(l, {
		title: "Change password",
		subtitle: "Update your account password",
		children: [m ? /* @__PURE__ */ c("div", {
			className: "text-center py-4",
			children: [
				/* @__PURE__ */ s("div", {
					className: "w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3",
					children: /* @__PURE__ */ s("svg", {
						className: "w-7 h-7 text-green-600",
						fill: "none",
						viewBox: "0 0 24 24",
						stroke: "currentColor",
						strokeWidth: 2,
						children: /* @__PURE__ */ s("path", {
							strokeLinecap: "round",
							strokeLinejoin: "round",
							d: "M5 13l4 4L19 7"
						})
					})
				}),
				/* @__PURE__ */ s("p", {
					className: "font-semibold text-gray-800",
					children: "Password updated!"
				}),
				/* @__PURE__ */ s("p", {
					className: "text-sm text-gray-500 mt-1",
					children: "Redirecting you back…"
				})
			]
		}) : /* @__PURE__ */ c("form", {
			onSubmit: v,
			noValidate: !0,
			children: [
				/* @__PURE__ */ s(_, {
					label: "Current password",
					placeholder: "••••••••",
					value: u.current,
					onChange: b("current"),
					error: f.current,
					autoComplete: "current-password"
				}),
				/* @__PURE__ */ s(_, {
					label: "New password",
					placeholder: "Min. 8 characters",
					value: u.password,
					onChange: b("password"),
					error: f.password,
					autoComplete: "new-password",
					showStrength: !0
				}),
				/* @__PURE__ */ s(_, {
					label: "Confirm new password",
					placeholder: "Re-enter new password",
					value: u.confirm,
					onChange: b("confirm"),
					error: f.confirm,
					autoComplete: "new-password"
				}),
				a && /* @__PURE__ */ s("p", {
					className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
					children: a
				}),
				/* @__PURE__ */ s(y, {
					type: "submit",
					text: "Update Password",
					loading: i
				})
			]
		}), !m && t && /* @__PURE__ */ s("p", {
			className: "text-center mt-5 text-sm text-gray-500",
			children: /* @__PURE__ */ s("button", {
				className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark",
				onClick: t,
				children: "Back"
			})
		})]
	});
}
//#endregion
//#region src/ui/screens/DeleteAccount.jsx
function k({ onDeleted: e, onCancel: t }) {
	let { deleteAccount: r, isLoading: i, error: a, user: u } = n(), [d, f] = o(""), [p, m] = o(!1), [h, g] = o("");
	async function v(t) {
		if (t.preventDefault(), !d) {
			g("Password is required to confirm deletion");
			return;
		}
		g(""), (await r({ password: d })).error || e?.();
	}
	let y = u?.email || u?.phone || "your account";
	return /* @__PURE__ */ c(l, {
		title: "Delete account",
		subtitle: "This action is permanent and cannot be undone",
		children: [
			/* @__PURE__ */ c("div", {
				className: "bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5",
				children: [
					/* @__PURE__ */ s("p", {
						className: "text-sm text-red-700 font-medium mb-1",
						children: "You are about to delete:"
					}),
					/* @__PURE__ */ s("p", {
						className: "text-sm text-red-600 font-mono",
						children: y
					}),
					/* @__PURE__ */ s("p", {
						className: "text-xs text-red-500 mt-2",
						children: "All your data will be permanently removed. This cannot be reversed."
					})
				]
			}),
			/* @__PURE__ */ c("form", {
				onSubmit: v,
				noValidate: !0,
				children: [
					/* @__PURE__ */ c("label", {
						className: "flex items-start gap-2.5 mb-4 cursor-pointer select-none",
						children: [/* @__PURE__ */ s("input", {
							type: "checkbox",
							checked: p,
							onChange: (e) => m(e.target.checked),
							className: "mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
						}), /* @__PURE__ */ s("span", {
							className: "text-sm text-gray-600",
							children: "I understand this is permanent and want to delete my account"
						})]
					}),
					/* @__PURE__ */ s(_, {
						label: "Enter your password to confirm",
						placeholder: "••••••••",
						value: d,
						onChange: (e) => f(e.target.value),
						error: h,
						autoComplete: "current-password"
					}),
					a && /* @__PURE__ */ s("p", {
						className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center",
						children: a
					}),
					/* @__PURE__ */ s("button", {
						type: "submit",
						disabled: !p || i,
						className: `w-full h-11 rounded-lg font-semibold text-white transition-opacity flex items-center justify-center
            ${!p || i ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"}
            bg-red-600`,
						children: i ? "Deleting…" : "Delete My Account"
					})
				]
			}),
			t && /* @__PURE__ */ s("p", {
				className: "text-center mt-5 text-sm text-gray-500",
				children: /* @__PURE__ */ s("button", {
					className: "font-semibold text-primary underline underline-offset-2 hover:text-primary-dark",
					onClick: t,
					children: "Cancel"
				})
			})
		]
	});
}
//#endregion
export { b as AUTH_SCREENS, l as AuthCard, D as AuthFlow, y as Button, O as ChangePassword, k as DeleteAccount, T as ForgotPassword, u as FormField, d as IdentifierInput, v as LoadingSpinner, w as OtpVerify, _ as PasswordField, E as ResetPassword, x as SignIn, S as SignUp };
