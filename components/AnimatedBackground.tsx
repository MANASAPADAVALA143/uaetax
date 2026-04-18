"use client";

export default function AnimatedBackground() {
  return (
    <div
      id="bg-canvas"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
    >
      <div
        className="orb orb-1 absolute rounded-full blur-[80px] animate-[drift_20s_ease-in-out_infinite]"
        style={{
          width: "900px",
          height: "650px",
          background:
            "radial-gradient(ellipse, rgba(30,90,200,0.50) 0%, rgba(14,50,130,0.22) 45%, transparent 70%)",
          top: "-280px",
          left: "-200px",
        }}
      />
      <div
        className="orb orb-2 absolute rounded-full blur-[80px] animate-[drift_20s_ease-in-out_infinite]"
        style={{
          width: "750px",
          height: "650px",
          background:
            "radial-gradient(ellipse, rgba(20,80,190,0.45) 0%, rgba(10,40,120,0.20) 45%, transparent 70%)",
          bottom: "-180px",
          right: "-160px",
          animationDelay: "-7s",
        }}
      />
      <div
        className="orb orb-3 absolute rounded-full blur-[80px] animate-[drift_20s_ease-in-out_infinite]"
        style={{
          width: "650px",
          height: "450px",
          background:
            "radial-gradient(ellipse, rgba(201,168,76,0.20) 0%, rgba(100,60,10,0.06) 45%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          animationDelay: "-14s",
        }}
      />
      <div
        className="orb orb-4 absolute rounded-full blur-[80px] animate-[drift_20s_ease-in-out_infinite]"
        style={{
          width: "500px",
          height: "380px",
          background:
            "radial-gradient(ellipse, rgba(40,120,255,0.18) 0%, transparent 70%)",
          top: "25%",
          right: "-80px",
          animationDelay: "-11s",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-35"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
          backgroundColor: "rgba(10,30,80,0.04)",
        }}
      />
    </div>
  );
}
