"use client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import Image from "next/image"
import { Badge } from "./ui/badge"
import { CheckIcon, EyeIcon, EyeOffIcon, Loader2, Copy } from "lucide-react"
import { toast } from "sonner"
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "./ui/input-otp"
import QRCode from "react-qr-code"
import { Label } from "./ui/label"


const formSchema = z.object({
  email: z
    .email("Invalid email address.")
    .min(2, "Email must be at least 2 characters."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});


export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  type SessionUser = { twoFactorEnabled?: boolean };

  const lastMethod = authClient.getLastUsedLoginMethod();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false);
  const [error, setError] = useState("");
  const [isVisible, setIsVisible] = useState<boolean>(false)
  const [otpStep, setOtpStep] = useState<"none" | "verify" | "prompt-enable" | "setup-qr" | "setup-backup">("none");
  const [otp, setOtp] = useState("");
  const [twoSetupLoading, setTwoSetupLoading] = useState(false);
  const [totpUri, setTotpUri] = useState<string | undefined>();
  const [backupCodes, setBackupCodes] = useState<string[] | undefined>();
  const [copied, setCopied] = useState(false);
  const [lastPassword, setLastPassword] = useState<string>("");
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpSetupVerifyLoading, setOtpSetupVerifyLoading] = useState(false);
  const [enable2faLoading, setEnable2faLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<"email" | "microsoft" | null>(null);

  const toggleVisibility = () => setIsVisible((prevState) => !prevState)



  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setAuthMethod("email");
    setError("");
    try {
      // Using extended signature with callbackURL & rememberMe, destructuring { data, error }
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
        // Don’t redirect yet; we want to handle 2FA state in-place
        callbackURL: undefined,
        rememberMe: false,
      }, {
        // Optional callbacks (uncomment / customize as needed)
        onSuccess: () => {
          // console.log("Login success")
          // We’ll toast after we decide next step
        }
      });

      if (error) {
        type ErrShape = { message?: string; statusText?: string }
        const errObj = error as ErrShape;
        const msg = errObj.message || errObj.statusText || "Login failed";
        toast.error(msg);
        setError(msg);
        return;
      }

      // After successful credential sign-in, check if a session exists.
      // If no session yet, it likely means 2FA is required (server withheld session until verification).
      const session = await authClient.getSession();
      if (!session?.data) {
        // Only show OTP flow for email sign-in attempts
        if (authMethod === "email" || authMethod === null) {
          setOtpStep("verify");
          toast.message("Two-factor verification", { description: "Enter the 6-digit code from your authenticator app." });
        } else {
          // For Microsoft, do not show OTP UI; navigate
          window.location.href = "/new-dash";
        }
        return;
      }

      // Session exists -> either 2FA not enabled (offer to enable) or enabled but not required.
      const twoFactorEnabled = Boolean((session.data.user as SessionUser)?.twoFactorEnabled);
      if (!twoFactorEnabled) {
        if (authMethod === "email" || authMethod === null) {
          setLastPassword(values.password);
          setOtpStep("prompt-enable");
          toast.message("You’re in", { description: "Protect your account by enabling 2FA now." });
        } else {
          // Microsoft login: do not show 2FA enable prompt; proceed
          window.location.href = "/new-dash";
        }
        return;
      }

      // Session exists and 2FA already enabled (no OTP required) -> proceed
      toast.success("Login successful");
      window.location.href = "/new-dash";

    } catch (e: unknown) {
      console.error(e);
      setError("An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  }




  const signInMicrosoft = async () => {

    setIsLoadingMicrosoft(true);
    setAuthMethod("microsoft");
    setError("");
    try {
      const res = await authClient.signIn.social({
        provider: "microsoft",
        callbackURL: "/new-dash", // The URL to redirect to after the sign in
      });
      if (res.error) {
        setError(res.error.statusText || "Login failed");
        return;
      }
    } catch {
      setError("An error occurred during login");
    } finally {
      setIsLoadingMicrosoft(false);
    }


  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* <form className="p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-muted-foreground text-balance">
                  Login to your Acme Inc account
                </p>
              </div>
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </div>
              <div className="grid gap-3">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <a
                    href="#"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <Input id="password" type="password" required />
              </div>
              <Button type="submit" className="w-full">
                Login
              </Button>
              <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                <span className="bg-card text-muted-foreground relative z-10 px-2">
                  Or continue with
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Button variant="outline" type="button" className="w-full">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">Login with Apple</span>
                </Button>
                <Button variant="outline" type="button" className="w-full">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">Login with Google</span>
                </Button>
                <Button variant="outline" type="button" className="w-full">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">Login with Meta</span>
                </Button>
              </div>
              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <a href="#" className="underline underline-offset-4">
                  Sign up
                </a>
              </div>
            </div>
          </form> */}
          {/* <form className="p-6 md:p-8"> */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 p-6 md:p-8">
              <div className="flex flex-col gap-6">
                <Image src="/Cyberlooplogo.svg" alt="Microsoft Logo" width={40} height={40} className="mr-1" />

                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold">Welcome back</h1>
                  <p className="text-muted-foreground text-balance text-sm">
                    Login to your Xlter account
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="shadcn@example.com" {...field} />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl >
                        <div className="relative">

                          <Input type={isVisible ? "text" : "password"} placeholder="Password" {...field} />
                          <button
                            className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                            onClick={toggleVisibility}
                            aria-label={isVisible ? "Hide password" : "Show password"}
                            aria-pressed={isVisible}
                            aria-controls="password"
                          >
                            {isVisible ? (
                              <EyeOffIcon size={16} aria-hidden="true" />
                            ) : (
                              <EyeIcon size={16} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {otpStep === "verify" && (
                  <div className="space-y-3">
                    <div className="text-sm">
                      Enter the 6-digit code from your authenticator app
                    </div>
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      className="w-full"
                      onChange={async (value) => {
                        setOtp(value);
                        if (value.length === 6 && !otpVerifyLoading) {
                          try {
                            setOtpVerifyLoading(true);
                            const { error } = await authClient.twoFactor.verifyTotp({ code: value });
                            if (error) {
                              toast.error(error.message || "Invalid code");
                              return;
                            }
                            toast.success("Login successful");
                            window.location.href = "/new-dash";
                          } finally {
                            setOtpVerifyLoading(false);
                          }
                        }
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                        <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={async () => {
                          if (otp.length !== 6 || otpVerifyLoading) return toast.error("Enter the 6-digit code");
                          try {
                            setOtpVerifyLoading(true);
                            const { error } = await authClient.twoFactor.verifyTotp({ code: otp });
                            if (error) return toast.error(error.message || "Invalid code");
                            toast.success("Login successful");
                            window.location.href = "/new-dash";
                          } finally {
                            setOtpVerifyLoading(false);
                          }
                        }}
                        className="w-full"
                        disabled={otpVerifyLoading}
                      >
                        {otpVerifyLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                          </>
                        ) : (
                          "Verify code"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {otpStep === "prompt-enable" && (
                  <div className="space-y-3">
                    <div className="text-sm">
                      You’re logged in. For extra security, enable two-factor authentication.
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={async () => {
                          try {
                            setEnable2faLoading(true);
                            setTwoSetupLoading(true);
                            const { data: enableData, error: enableErr } = await authClient.twoFactor.enable({ password: lastPassword });
                            if (enableErr) {
                              toast.error(enableErr.message || "Failed to start 2FA setup");
                              setTwoSetupLoading(false);
                              setEnable2faLoading(false);
                              return;
                            }
                            if (enableData?.totpURI) setTotpUri(enableData.totpURI);
                            if (enableData?.backupCodes) setBackupCodes(enableData.backupCodes);
                            setOtpStep("setup-qr");
                          } catch {
                            toast.error("Failed to start 2FA setup");
                          } finally {
                            setTwoSetupLoading(false);
                            setEnable2faLoading(false);
                          }
                        }}
                        className="w-full"
                        disabled={enable2faLoading}
                      >
                        {enable2faLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...
                          </>
                        ) : (
                          "Enable 2FA now"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { window.location.href = "/new-dash"; }}
                        className="w-full"
                      >
                        Skip for now
                      </Button>
                    </div>
                  </div>
                )}

                {otpStep === "setup-qr" && (
                  <div className="space-y-4">
                    <div className="text-sm">Scan this QR code with your authenticator app</div>
                    <div className="flex justify-center p-4 bg-white rounded-lg border">
                      {twoSetupLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : totpUri ? (
                        <QRCode value={totpUri} />
                      ) : (
                        <div className="text-sm text-muted-foreground">Preparing setup…</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="otp-setup">Verification Code</Label>
                      {/* <InputOTP maxLength={6}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP> */}
                      <InputOTP
                        maxLength={6}
                        value={otp}
                        onChange={async (value) => {
                          setOtp(value);
                          if (value.length === 6 && !otpSetupVerifyLoading) {
                            try {
                              setOtpSetupVerifyLoading(true);
                              const { error } = await authClient.twoFactor.verifyTotp({ code: value });
                              if (error) {
                                toast.error(error.message || "Invalid code");
                                return;
                              }
                              if (backupCodes && backupCodes.length) {
                                setOtpStep("setup-backup");
                              } else {
                                toast.success("Two-factor enabled. Login successful");
                                window.location.href = "/new-dash";
                              }
                            } finally {
                              setOtpSetupVerifyLoading(false);
                            }
                          }
                        }}
                      >
                         <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                      <Button
                        type="button"
                        onClick={async () => {
                          if (otp.length !== 6 || otpSetupVerifyLoading) return toast.error("Enter the 6-digit code");
                          try {
                            setOtpSetupVerifyLoading(true);
                            const { error } = await authClient.twoFactor.verifyTotp({ code: otp });
                            if (error) return toast.error(error.message || "Invalid code");
                            if (backupCodes && backupCodes.length) {
                              setOtpStep("setup-backup");
                            } else {
                              toast.success("Two-factor enabled. Login successful");
                              window.location.href = "/new-dash";
                            }
                          } finally {
                            setOtpSetupVerifyLoading(false);
                          }
                        }}
                        className="w-full"
                        disabled={otpSetupVerifyLoading}
                      >
                        {otpSetupVerifyLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                          </>
                        ) : (
                          "Verify & Continue"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {otpStep === "setup-backup" && backupCodes && (
                  <div className="space-y-3">
                    <div className="text-sm">Save these backup codes in a secure place</div>
                    <div className="relative p-3 bg-muted rounded-lg border">
                      <pre className="text-xs font-mono whitespace-pre-line m-0">{backupCodes.join("\n")}</pre>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2"
                        onClick={async () => {
                          await navigator.clipboard.writeText(backupCodes.join("\n"));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        aria-label="Copy backup codes"
                      >
                        {copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button type="button" className="w-full" onClick={() => { toast.success("Two-factor enabled. Login successful"); window.location.href = "/new-dash"; }}>Done</Button>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading || otpStep !== "none"}>
                  {!isLoading ? (
                    <>
                      Login
                      {lastMethod === "email" && (
                        <Badge variant="outline" className="text-accent gap-1 outline-0 border-0"><CheckIcon className="text-emerald-500" size={12} aria-hidden="true" /> Last used</Badge>
                      )}
                    </>
                  ) : "Logging in..."}
                </Button>
                {otpStep === "none" && (
                  <>
                    <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                      <span className="bg-card text-muted-foreground relative z-10 px-2">
                        Or continue with
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <Button variant="outline" type="button" className="w-full h-[41px]" onClick={signInMicrosoft} disabled={isLoading || isLoadingMicrosoft} >
                        {!isLoadingMicrosoft ? (
                          <>
                            <Image src="/ms-symbollockup_mssymbol_19.svg" alt="Microsoft Logo" width={20} height={20} className="mr-1" />
                            Sign in with Microsoft
                            {lastMethod === "microsoft" && (
                              <Badge className="ml-2">Last used</Badge>
                            )}
                          </>
                        ) : "Logging in..."}
                      </Button>
                    </div>
                  </>
                )}
                {/* <div className="text-center text-sm">
                  Don&apos;t have an account?{" "}
                  <a href="#" className="underline underline-offset-4">
                    Sign up
                  </a>
                </div> */}
                {error && (
                  <div className="text-sm text-red-600 text-center" role="alert">{error}</div>
                )}
              </div>
              {/* </form> */}
            </form>
          </Form>

          <div className="bg-muted relative hidden md:block">
            <Image
              src="/bg-new.png"
              alt="Background"
              fill
              className="object-cover dark:brightness-[0.2] dark:grayscale"
              priority
            />
          </div>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </div>
    </div >
  )
}
