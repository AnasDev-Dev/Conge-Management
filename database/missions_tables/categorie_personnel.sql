-- phpMyAdmin SQL Dump
-- version 4.5.1
-- http://www.phpmyadmin.net
--
-- Client :  127.0.0.1
-- Généré le :  Jeu 26 Mars 2026 à 15:10
-- Version du serveur :  10.1.13-MariaDB
-- Version de PHP :  5.6.21

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données :  `smartflow_ath`
--

-- --------------------------------------------------------

--
-- Structure de la table `categorie_personnel`
--

CREATE TABLE `categorie_personnel` (
  `id` int(11) NOT NULL,
  `designation` varchar(255) NOT NULL,
  `idCreate` int(11) NOT NULL,
  `dateCreate` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `idModif` int(11) NOT NULL,
  `dateModif` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Contenu de la table `categorie_personnel`
--

INSERT INTO `categorie_personnel` (`id`, `designation`, `idCreate`, `dateCreate`, `idModif`, `dateModif`) VALUES
(1, 'MEMBRES DU CONSEIL Dâ€™ADMINISTRATION, DIRECTEUR EXECUTIF & TRESORIER GENERAL', 1, '2024-07-26 16:45:21', 0, '0000-00-00 00:00:00'),
(2, 'DIRECTEURS & COORDONATEURS DES EVENEMENTS MAJEURS', 1, '2024-07-26 16:45:50', 0, '0000-00-00 00:00:00'),
(3, 'RESPONSABLES DE PÃ”LES & CADRES', 1, '2024-07-26 16:45:58', 0, '0000-00-00 00:00:00'),
(4, 'AGENTS ET AUTRES', 1, '2024-07-26 16:46:04', 0, '0000-00-00 00:00:00');

--
-- Index pour les tables exportées
--

--
-- Index pour la table `categorie_personnel`
--
ALTER TABLE `categorie_personnel`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT pour les tables exportées
--

--
-- AUTO_INCREMENT pour la table `categorie_personnel`
--
ALTER TABLE `categorie_personnel`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
