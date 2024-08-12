{pkgs ? import <nixpkgs> {}}: let
  project =
    pkgs.callPackage ../../yarn-project.nix {
      nodejs = pkgs.nodejs-18_x;
    } {
      src = pkgs.lib.cleanSource ../..;
    };
in
  project.overrideAttrs (oldAttrs: {
    name = "validator-ejector";
    buildInputs = oldAttrs.buildInputs ++ [pkgs.python3];
    buildPhase = ''
      yarn build
    '';
  })
