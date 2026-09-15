import { t as e } from "./createAuthClient-BEW9IoGj.js";
import { createContext as t, useContext as n, useState as r, useSyncExternalStore as i } from "react";
import { jsx as a } from "react/jsx-runtime";
//#region src/react/AuthProvider.jsx
var o = t(null);
function s({ client: t, config: n, children: i }) {
	let [s] = r(() => t ?? e(n));
	return /* @__PURE__ */ a(o.Provider, {
		value: s,
		children: i
	});
}
//#endregion
//#region src/react/useAuth.js
function c() {
	let e = n(o);
	if (!e) throw Error("useAuth() must be used within an <AuthProvider>");
	return {
		...i(e.subscribe, e.getState, e.getState),
		signUp: e.signUp,
		signIn: e.signIn,
		login: e.login,
		verifyOtp: e.verifyOtp,
		resendOtp: e.resendOtp,
		forgotPassword: e.forgotPassword,
		verifyResetOtp: e.verifyResetOtp,
		resetPassword: e.resetPassword,
		changePassword: e.changePassword,
		deleteAccount: e.deleteAccount,
		fetchTokens: e.fetchTokens,
		refreshToken: e.refreshToken,
		signOut: e.signOut,
		logout: e.logout
	};
}
//#endregion
export { o as n, s as r, c as t };
