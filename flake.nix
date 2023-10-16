{
  description = "Validator Ejector";

  inputs = {
    nixpkgs.url = github:NixOS/nixpkgs/nixos-unstable;

    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
  };

  outputs = inputs @ {flake-parts, ...}:
    flake-parts.lib.mkFlake {inherit inputs;} {
      systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
      perSystem = {pkgs, ...}: let
        nodejs = pkgs.nodejs_20;
        yarn = pkgs.yarn.override {inherit nodejs;};
      in {
        devShells.default = pkgs.mkShellNoCC {
          packages = [nodejs yarn];
        };

        packages.validator-ejector = pkgs.callPackage ./packages/validator-ejector {};
      };
    };
}
