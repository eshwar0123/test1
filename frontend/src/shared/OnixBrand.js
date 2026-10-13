import React from "react";

const OnixBrand = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: "25px",
        left: "35px",
        zIndex: 10,
      }}
    >
      <img
        src="/logo.png"
        alt="ONIX"
        style={{
          height: "65px",
          objectFit: "contain"
        }}
      />
    </div>
  );
};

export default OnixBrand;
